import type { AccessControl, Actor } from '../access.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import type { EventBus } from '../events.js';
import type { FieldContext, FieldType, ValidationMode } from '../field-type.js';
import type { ContentTypeDef, Entry, EntryData, EntryVersion, Page, PublicEntry, Revision } from '../model.js';
import type { Clock, EntryQuery, EntryRepository, IdGenerator } from '../ports.js';
import type { Registry } from '../registry.js';
import { toPublicData, validateData } from '../schema-builder.js';
import { isSlug } from '../slug.js';
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
    const type = await this.schema.get(input.typeId);
    requireSlug(input.slug);
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

  async update(actor: Actor, id: string, input: UpdateEntryInput): Promise<Entry> {
    this.access.require(actor, 'entry:write');
    const current = await this.load(id);
    this.requireRevision(current, input.expectedRevision);
    if (input.slug !== undefined) requireSlug(input.slug);
    const type = await this.schema.get(current.typeId);

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

  /** Makes the working version the one visitors see. This is where required fields are enforced. */
  async publish(actor: Actor, id: string, expectedRevision?: number): Promise<Entry> {
    this.access.require(actor, 'entry:publish');
    const current = await this.load(id);
    if (expectedRevision !== undefined) this.requireRevision(current, expectedRevision);
    const type = await this.schema.get(current.typeId);
    validateData(type.fields, current.data, this.context('publish'));

    const now = this.clock.now();
    const revision = current.revision + 1;
    const published = await this.entries.save(
      {
        ...current,
        status: 'published',
        revision,
        updatedAt: now,
        published: { slug: current.slug, data: current.data, revision, at: now },
      },
      { expectedRevision: current.revision, actorId: actor.id },
    );
    await this.events.emit('entry.published', { entry: published, actor });
    return published;
  }

  async unpublish(actor: Actor, id: string): Promise<Entry> {
    this.access.require(actor, 'entry:publish');
    const current = await this.load(id);
    if (current.status === 'draft') return current;
    const { published, ...rest } = current;
    const draft = await this.entries.save(
      { ...rest, status: 'draft', revision: current.revision + 1, updatedAt: this.clock.now() },
      { expectedRevision: current.revision, actorId: actor.id },
    );
    await this.events.emit('entry.unpublished', { entry: draft, actor });
    return draft;
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

function requireSlug(slug: string): void {
  if (isSlug(slug)) return;
  const message =
    slug === ''
      ? 'Give this entry a slug. It is the last part of its address.'
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
