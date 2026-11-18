import { PublishChecks } from '../checks.js';
import type { AccessControl, Actor } from '../access.js';
import { CmsError, ConflictError, NotFoundError, ValidationError } from '../errors.js';
import type { EventBus } from '../events.js';
import type { FieldContext, FieldType, ValidationMode } from '../field-type.js';
import { isTrashed, liveFields } from '../model.js';
import type { ContentTypeDef, Entry, EntryData, EntryVersion, Page, PublicEntry, Revision, Timestamp } from '../model.js';
import type { Clock, EntryQuery, EntryRepository, IdGenerator } from '../ports.js';
import type { Registry } from '../registry.js';
import { toPublicData, validateData } from '../schema-builder.js';
import { MAX_SLUG_LENGTH, isSlug, isSlugPath, takesSlugPath } from '../slug.js';
import type { SchemaService } from './schema-service.js';

export interface CreateEntryInput {
  readonly typeId: string;
  readonly locale: string;
  readonly slug: string;
  readonly data: EntryData;
  /** Set to join an existing entry's translations. Left out, the entry starts its own group. */
  readonly translationGroup?: string;
}

export interface UpdateEntryInput {
  readonly data?: EntryData;
  readonly slug?: string;
  /** The revision the editor loaded. The update is refused if someone saved in between. */
  readonly expectedRevision: number;
}

/** How many copies of one entry may sit side by side under its slug. */
const MAX_COPIES = 50;
/** How many due entries one look publishes. The next look takes the rest. */
const DUE_AT_ONCE = 20;
/** Who publishes an entry whose time has come. */
const SCHEDULE: Actor = { kind: 'agent', id: 'schedule', role: 'editor' };

/**
 * Owns entries. Every write takes the same four steps, in the same order: check permission,
 * validate, save with history, announce.
 */
export class ContentService {
  constructor(
    private readonly entries: EntryRepository,
    private readonly schema: SchemaService,
    private readonly fields: Registry<FieldType>,
    private readonly access: AccessControl,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly checks: PublishChecks = new PublishChecks(),
  ) {}

  async get(actor: Actor, id: string): Promise<Entry> {
    this.access.require(actor, 'entry:read');
    return this.load(id);
  }

  find(actor: Actor, query: EntryQuery = {}): Promise<Page<Entry>> {
    this.access.require(actor, 'entry:read');
    return this.entries.find(query);
  }

  /** One entry by its slug: the slug visitors see, or the one being worked on. */
  async findBySlug(
    actor: Actor,
    where: { typeId: string; locale: string; slug: string; version?: EntryVersion },
  ): Promise<Entry | null> {
    this.access.require(actor, 'entry:read');
    const { typeId, locale, slug, version = 'published' } = where;
    const found = await this.entries.find({
      typeId,
      locale,
      limit: 1,
      ...(version === 'published' ? { publishedSlug: slug } : { slug }),
    });
    return found.items[0] ?? null;
  }

  async history(actor: Actor, id: string): Promise<Revision[]> {
    this.access.require(actor, 'entry:read');
    await this.load(id);
    return this.entries.history(id);
  }

  /** Creates a draft. Required fields may still be empty: they are checked on publish. */
  async create(actor: Actor, input: CreateEntryInput): Promise<Entry> {
    this.access.require(actor, 'entry:write');
    const type = await this.schema.getLive(input.typeId);
    requireSlug(input.slug, type);
    // A single is one page, such as the home page: one entry in each language, and no more.
    if (type.kind === 'single' && (await this.entries.find({ typeId: type.id, locale: input.locale, limit: 1 })).total > 0) {
      throw new ConflictError(`"${type.key}" is a single page and already has its entry in this language. Open that entry to change it.`);
    }
    const now = this.clock.now();
    const id = this.ids.next();
    const entry: Entry = {
      id,
      typeId: type.id,
      locale: input.locale,
      translationGroup: input.translationGroup ?? id,
      slug: input.slug,
      status: 'draft',
      data: validateData(type.fields, input.data, this.context('draft')),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    return this.save(actor, entry, null);
  }

  /**
   * Makes a copy of an entry to start a new one from: a draft of the same type and language with
   * what the original holds now, under the original's slug with `-copy` after it (then
   * `-copy-2`, and so on). The copy is a page of its own, not a translation of the original, and
   * nothing of it is published.
   */
  async duplicate(actor: Actor, id: string): Promise<Entry> {
    this.access.require(actor, 'entry:write');
    const original = await this.loadLive(id);
    const type = await this.schema.getLive(original.typeId);
    if (type.kind === 'single') throw new ConflictError(`"${type.key}" is a single page, so it cannot be duplicated: it has one entry in each language.`);
    let slug = '';
    for (let count = 1; count <= MAX_COPIES; count += 1) {
      const ending = count === 1 ? '-copy' : `-copy-${count}`;
      // A long slug gives up its end, so the copy's still fits.
      const candidate = `${original.slug.slice(0, MAX_SLUG_LENGTH - ending.length).replace(/[-/]+$/, '')}${ending}`;
      if ((await this.entries.find({ typeId: type.id, locale: original.locale, slug: candidate, limit: 1 })).total === 0) {
        slug = candidate;
        break;
      }
    }
    if (slug === '') throw new ConflictError(`"${original.slug}" already has ${MAX_COPIES} copies. Rename or remove some of them first.`);
    const now = this.clock.now();
    const copyId = this.ids.next();
    return this.save(actor, { id: copyId, typeId: type.id, locale: original.locale, translationGroup: copyId, slug, status: 'draft', data: original.data, revision: 1, createdAt: now, updatedAt: now }, null);
  }

  async update(actor: Actor, id: string, input: UpdateEntryInput): Promise<Entry> {
    this.access.require(actor, 'entry:write');
    const current = await this.loadLive(id);
    this.requireRevision(current, input.expectedRevision);
    const type = await this.schema.getLive(current.typeId);
    if (input.slug !== undefined) requireSlug(input.slug, type);

    // Only the working version changes, so it may be unfinished even when the entry is published.
    const data =
      input.data === undefined
        ? current.data
        : { ...removedFieldData(type, current.data), ...validateData(type.fields, input.data, this.context('draft')) };

    return this.save(
      actor,
      {
        ...current,
        slug: input.slug ?? current.slug,
        data,
        revision: current.revision + 1,
        updatedAt: this.clock.now(),
      },
      current.revision,
    );
  }

  /**
   * Brings back what an entry held at an earlier revision, as a new save of the working version.
   * Nothing is rewound: the history gains a revision, and what visitors see stays until someone
   * publishes. The slug stays as it is today. A value today's fields would not take (a choice
   * that was removed since) is left as it is now, so an old version can always be brought back.
   */
  async revert(actor: Actor, id: string, input: { readonly revision: number; readonly expectedRevision: number }): Promise<Entry> {
    this.access.require(actor, 'entry:write');
    const current = await this.loadLive(id);
    this.requireRevision(current, input.expectedRevision);
    const earlier = (await this.entries.history(id)).find((revision) => revision.revision === input.revision);
    if (!earlier) throw new NotFoundError(`Revision ${input.revision} of entry`, id);
    const type = await this.schema.getLive(current.typeId);

    const data: Record<string, unknown> = removedFieldData(type, current.data);
    for (const field of liveFields(type.fields)) {
      if (!(field.id in earlier.data)) continue;
      try {
        Object.assign(data, validateData([field], { [field.id]: earlier.data[field.id] }, this.context('draft')));
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        if (field.id in current.data) data[field.id] = current.data[field.id];
      }
    }
    return this.save(actor, { ...current, data, revision: current.revision + 1, updatedAt: this.clock.now() }, current.revision);
  }

  /** Makes the working version the one visitors see. This is where required fields are enforced. */
  async publish(actor: Actor, id: string, expectedRevision?: number): Promise<Entry> {
    this.access.require(actor, 'entry:publish');
    const current = await this.loadLive(id);
    if (expectedRevision !== undefined) this.requireRevision(current, expectedRevision);
    return this.goLive(actor, current);
  }

  /**
   * Sets the working version to go on the site at a time to come. It must be fit to publish now,
   * so a missing field is heard of today and not when nobody is looking. What goes out is what
   * the entry holds when the time comes, so it can still be worked on.
   */
  async schedule(actor: Actor, id: string, input: { readonly at: Timestamp; readonly expectedRevision: number }): Promise<Entry> {
    this.access.require(actor, 'entry:publish');
    const current = await this.loadLive(id);
    this.requireRevision(current, input.expectedRevision);
    const at = new Date(input.at);
    if (Number.isNaN(at.getTime()) || at.toISOString() <= this.clock.now()) {
      const message = 'Choose a day and time that is still to come.';
      throw new ValidationError(message, [{ path: ['publishAt'], message }]);
    }
    await this.fit(actor, await this.schema.getLive(current.typeId), current);
    const { publishProblem, ...rest } = current;
    return this.save(actor, { ...rest, publishAt: at.toISOString(), revision: current.revision + 1, updatedAt: this.clock.now() }, current.revision);
  }

  /** Takes an entry off the schedule. It stays as it is, on the site or not. */
  async unschedule(actor: Actor, id: string): Promise<Entry> {
    this.access.require(actor, 'entry:publish');
    const current = await this.loadLive(id);
    if (current.publishAt === undefined && current.publishProblem === undefined) return current;
    const { publishAt, publishProblem, ...rest } = current;
    return this.save(actor, { ...rest, revision: current.revision + 1, updatedAt: this.clock.now() }, current.revision);
  }

  /**
   * Publishes every entry whose time has come, and answers with how many went out. Nobody is
   * signed in for this: the host calls it, as often as it likes. An entry that is no longer fit
   * to publish comes off the schedule with the reason kept on it (`publishProblem`), so it is
   * neither tried for ever nor lost sight of.
   */
  async publishDue(): Promise<number> {
    const due = await this.entries.find({ dueBy: this.clock.now(), limit: DUE_AT_ONCE });
    let published = 0;
    for (const entry of due.items) {
      try {
        await this.goLive(SCHEDULE, entry);
        published += 1;
      } catch (error) {
        // Another copy of the site may have seen to it first.
        const now = await this.entries.get(entry.id);
        if (!now || now.revision !== entry.revision || now.publishAt === undefined) continue;
        if (!(error instanceof CmsError)) throw error;
        const { publishAt, ...rest } = now;
        await this.save(SCHEDULE, { ...rest, publishProblem: error.message, revision: now.revision + 1, updatedAt: this.clock.now() }, now.revision).catch(() => undefined);
      }
    }
    return published;
  }

  /** Refuses an entry that cannot go on the site as it is: its fields, then the plugins' checks. */
  private async fit(actor: Actor, type: ContentTypeDef, current: Entry): Promise<void> {
    validateData(type.fields, current.data, this.context('publish'));
    // Then what the site's plugins ask of an entry before it goes out.
    const issues = await this.checks.run({ entry: this.toPublic(type, current, 'working'), type, actor });
    const [first] = issues;
    if (first) throw new ValidationError(first.message, issues);
  }

  private async goLive(actor: Actor, current: Entry): Promise<Entry> {
    await this.fit(actor, await this.schema.getLive(current.typeId), current);
    const now = this.clock.now();
    const revision = current.revision + 1;
    const { publishAt, publishProblem, ...rest } = current;
    const published = await this.entries.save(
      {
        ...rest,
        status: 'published',
        revision,
        updatedAt: now,
        published: { slug: current.slug, data: current.data, revision, at: now },
      },
      { expectedRevision: current.revision, actorId: actor.id },
    );
    await this.events.emit('entry.published', { entry: published, before: current, actor });
    return published;
  }

  async unpublish(actor: Actor, id: string): Promise<Entry> {
    this.access.require(actor, 'entry:publish');
    const current = await this.loadLive(id);
    if (current.status === 'draft') return current;
    const { published, ...rest } = current;
    const draft = await this.entries.save(
      { ...rest, status: 'draft', revision: current.revision + 1, updatedAt: this.clock.now() },
      { expectedRevision: current.revision, actorId: actor.id },
    );
    await this.events.emit('entry.unpublished', { entry: draft, before: current, actor });
    return draft;
  }

  /**
   * Moves an entry to the trash. It leaves the site at once and every list but the trash, and its
   * slug is free for another entry. Nothing is lost: `restore` brings it back as a draft.
   */
  async trash(actor: Actor, id: string): Promise<Entry> {
    this.access.require(actor, 'entry:write');
    const current = await this.load(id);
    if (isTrashed(current)) return current;
    // Taking a page off the site is a publishing decision, whichever button does it.
    if (current.published) this.access.require(actor, 'entry:publish');
    const { published, publishAt, publishProblem, ...rest } = current;
    const now = this.clock.now();
    const trashed = await this.entries.save(
      { ...rest, status: 'draft', revision: current.revision + 1, updatedAt: now, deletedAt: now },
      { expectedRevision: current.revision, actorId: actor.id },
    );
    if (published) await this.events.emit('entry.unpublished', { entry: trashed, before: current, actor });
    await this.events.emit('entry.trashed', { entry: trashed, before: current, actor });
    return trashed;
  }

  /** Brings an entry back from the trash, as a draft: it returns to the site when it is published. */
  async restore(actor: Actor, id: string): Promise<Entry> {
    this.access.require(actor, 'entry:write');
    const current = await this.load(id);
    if (!isTrashed(current)) return current;
    const type = await this.schema.getLive(current.typeId);
    // Its slug was free while it was away, and its place too if it is the one entry of a single.
    const others = async (query: EntryQuery) => (await this.entries.find({ ...query, typeId: type.id, locale: current.locale, limit: 1 })).total > 0;
    const taken = type.kind === 'single' ? await others({}) : (await others({ slug: current.slug })) || (await others({ publishedSlug: current.slug }));
    if (taken) {
      throw new ConflictError(
        type.kind === 'single'
          ? `"${type.key}" is a single page and has another entry in this language now. Move that entry to the trash first, then restore this one.`
          : `Another entry uses the slug "${current.slug}" now. Change that entry's slug first, then restore this one.`,
      );
    }
    const { deletedAt, ...rest } = current;
    const restored = await this.entries.save(
      { ...rest, revision: current.revision + 1, updatedAt: this.clock.now() },
      { expectedRevision: current.revision, actorId: actor.id },
    );
    await this.events.emit('entry.restored', { entry: restored, actor });
    return restored;
  }

  /** Deletes an entry and its history for good. Only an entry in the trash can go this way. */
  async delete(actor: Actor, id: string): Promise<void> {
    this.access.require(actor, 'entry:delete');
    const current = await this.load(id);
    if (!isTrashed(current)) {
      throw new ConflictError('Move this entry to the trash first. Only an entry in the trash can be deleted for good.');
    }
    await this.entries.remove(id);
    await this.events.emit('entry.deleted', { entry: current, actor });
  }

  /**
   * The entry as the site reads it: values keyed by field key, removed fields left out. Visitors
   * get the published version. A preview asks for the working one.
   */
  toPublic(type: ContentTypeDef, entry: Entry, version: EntryVersion = 'published'): PublicEntry {
    const source = version === 'working' ? entry : entry.published;
    if (!source) throw new NotFoundError('Published version of entry', entry.id);
    return {
      id: entry.id,
      slug: source.slug,
      locale: entry.locale,
      translationGroup: entry.translationGroup,
      data: toPublicData(type.fields, source.data, this.context('publish')),
    };
  }

  private async save(actor: Actor, entry: Entry, expectedRevision: number | null): Promise<Entry> {
    const saved = await this.entries.save(entry, { expectedRevision, actorId: actor.id });
    await this.events.emit('entry.saved', { entry: saved, actor });
    return saved;
  }

  private async load(id: string): Promise<Entry> {
    const entry = await this.entries.get(id);
    if (!entry) throw new NotFoundError('Entry', id);
    return entry;
  }

  /** An entry to change. One in the trash is restored first. */
  private async loadLive(id: string): Promise<Entry> {
    const entry = await this.load(id);
    if (isTrashed(entry)) throw new ConflictError('This entry is in the trash. Restore it to change it.');
    return entry;
  }

  private requireRevision(current: Entry, expected: number): void {
    if (current.revision !== expected) {
      throw new ConflictError(
        `This entry was saved by someone else while you were editing. You have revision ${expected}; it is now at ${current.revision}.`,
      );
    }
  }

  private context(mode: ValidationMode): FieldContext {
    return { fields: this.fields, mode };
  }
}

/** The path a problem with the slug is reported at. No field can have this key: keys are words. */
export const SLUG_PATH = '$slug';

function requireSlug(slug: string, type: ContentTypeDef): void {
  // Only a type whose address pattern says [...slug] has pages under other pages.
  const deep = takesSlugPath(type);
  if (deep ? isSlugPath(slug) : isSlug(slug)) return;
  const message =
    slug === ''
      ? 'Give this entry a slug. It is the last part of its address.'
      : deep
        ? `"${slug}" cannot be a slug. Use lowercase letters, numbers and hyphens, with a slash between the parts of a longer address, such as services/roofing.`
        : `"${slug}" cannot be a slug. Use lowercase letters, numbers and hyphens, such as lake-house.`;
  throw new ValidationError(message, [{ path: [SLUG_PATH], message }]);
}

/**
 * The stored values of fields that were removed from the type. They are carried through every
 * save untouched, so restoring a field brings its content back.
 */
function removedFieldData(type: ContentTypeDef, data: EntryData): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const field of type.fields) {
    if (field.deletedAt !== undefined && field.id in data) kept[field.id] = data[field.id];
  }
  return kept;
}
