import type { AccessControl, Actor } from '../access.js';
import { NotFoundError, ValidationError } from '../errors.js';
import type { EventBus } from '../events.js';
import { isLiveType, type ContentTypeDef, type LikeCount, type LikeState, type Timestamp } from '../model.js';
import type { Clock, EntryRepository, LikeStore, SchemaRepository } from '../ports.js';

/** What a visitor likes: an entry, by its type's key and its translation group, as a page names it. */
export interface LikeSubject {
  readonly type: string;
  readonly entry: string;
}

/**
 * What stands for one visitor: a hash the site makes with its secret from a random id the
 * visitor's browser keeps. Sixty-four letters of hex, so nothing else can be kept in its place.
 */
const VISITOR = /^[0-9a-f]{64}$/;
/** What a translation group is made of. Anything else names no entry. */
const GROUP = /^[\w-]{1,100}$/;
/** The most entries one page may ask about at once: a listing's cards. */
export const MAX_LIKE_COUNTS = 100;
/** The most entries the editor is told of when it asks which are liked most. */
export const MAX_TOP_LIKED = 50;

/**
 * Likes: a visitor presses a heart on a post, a recipe or a listing, and the site counts it.
 *
 * A content type says whether its entries take likes (`ContentTypeDef.likes`), which someone sets
 * in the type's settings. A like is no content and holds nothing personal: it is the entry, a
 * hash that stands for a browser and a time. Visitors are nobody to the CMS, so `like` and `state`
 * take no actor; the site's address that takes them (`LikePosts` in `cms-astro`) checks where a
 * post comes from and how many one address sends. The editor reads the counts as anyone who may
 * read entries.
 */
export class LikeService {
  constructor(
    private readonly store: LikeStore,
    private readonly types: SchemaRepository,
    private readonly entries: EntryRepository,
    private readonly access: AccessControl,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {
    // An entry gone for good takes its likes with it, once no language of it is left.
    events.on('entry.deleted', async ({ entry }) => {
      const left = await this.entries.find({ typeId: entry.typeId, translationGroup: entry.translationGroup, limit: 1 });
      const trashed = await this.entries.find({ typeId: entry.typeId, translationGroup: entry.translationGroup, trashed: true, limit: 1 });
      if (left.items.length === 0 && trashed.items.length === 0) await this.store.clear(entry.typeId, entry.translationGroup);
    });
  }

  /**
   * A visitor likes an entry, or with `liked: false` takes the like back. Liking twice counts
   * once. Only a published entry of a type that takes likes can be liked; anything else is
   * answered as an entry that is not there.
   */
  async like(subject: LikeSubject, visitor: string, liked = true): Promise<LikeState> {
    requireVisitor(visitor);
    const type = await this.#liked(subject);
    const changed = liked
      ? await this.store.add({ typeId: type.id, entry: subject.entry, visitor, at: this.clock.now() })
      : await this.store.remove(type.id, subject.entry, visitor);
    const count = (await this.store.counts(type.id, [subject.entry]))[subject.entry] ?? 0;
    if (changed) await this.events.emit('entry.liked', { typeId: type.id, entry: subject.entry, liked, count });
    return { liked, ...(type.likes?.showCount === true && { count }) };
  }

  /** What a visitor's page shows for an entry: whether this visitor liked it, and how many did when the type shows its count. */
  async state(subject: LikeSubject, visitor?: string): Promise<LikeState> {
    if (visitor !== undefined) requireVisitor(visitor);
    const type = await this.#liked(subject);
    const liked = visitor === undefined ? false : await this.store.has(type.id, subject.entry, visitor);
    if (type.likes?.showCount !== true) return { liked };
    return { liked, count: (await this.store.counts(type.id, [subject.entry]))[subject.entry] ?? 0 };
  }

  /**
   * How many likes each of some entries has, for a page that lists them (a blog's cards), by
   * translation group. A type that does not show its count answers with none. Entries that are
   * not published are left out.
   */
  async publicCounts(typeKey: string, entries: readonly string[]): Promise<Record<string, number>> {
    if (entries.length > MAX_LIKE_COUNTS) throw new ValidationError(`A page can ask about ${MAX_LIKE_COUNTS} entries at most at once, and this one asked about ${entries.length}.`, [{ path: ['entries'], message: `At most ${MAX_LIKE_COUNTS}.` }]);
    const type = await this.types.getByKey(typeKey);
    if (!type || !isLiveType(type) || type.likes?.showCount !== true) return {};
    const named = [...new Set(entries.filter((entry) => GROUP.test(entry)))];
    if (named.length === 0) return {};
    const counted = await this.store.counts(type.id, named);
    const published = await this.#published(type, named);
    return Object.fromEntries(named.filter((entry) => published.has(entry)).map((entry) => [entry, counted[entry] ?? 0]));
  }

  /** How many likes each entry of a type has, by translation group, for the editor. An entry with none is left out. */
  async counts(actor: Actor, typeId: string): Promise<Record<string, number>> {
    this.access.require(actor, 'entry:read');
    return this.store.counts(typeId);
  }

  /**
   * The most liked entries of the site's live types, most first, for the editor's Home. With
   * `since`, only the likes made since then count: what was liked this week.
   */
  async top(actor: Actor, options: { readonly limit?: number; readonly since?: Timestamp } = {}): Promise<LikeCount[]> {
    this.access.require(actor, 'entry:read');
    const limit = Math.min(Math.max(1, Math.trunc(options.limit ?? 10)), MAX_TOP_LIKED);
    const live = new Set((await this.types.list()).filter((type) => isLiveType(type)).map((type) => type.id));
    // Asked for more than is shown, so an archived type's likes do not leave the list short.
    const counted = await this.store.top(limit * 2, options.since);
    return counted.filter((one) => live.has(one.typeId)).slice(0, limit);
  }

  /** The type of a subject, when it takes likes and the entry is on the site. */
  async #liked(subject: LikeSubject): Promise<ContentTypeDef> {
    const type = typeof subject.type === 'string' ? await this.types.getByKey(subject.type) : null;
    if (!type || !isLiveType(type) || type.likes === undefined || typeof subject.entry !== 'string' || !GROUP.test(subject.entry) || !(await this.#published(type, [subject.entry])).has(subject.entry)) {
      throw new NotFoundError('Entry that takes likes', `${String(subject.type)}/${String(subject.entry)}`);
    }
    return type;
  }

  /** Which of these translation groups have a version on the site. */
  async #published(type: ContentTypeDef, groups: readonly string[]): Promise<Set<string>> {
    const found = new Set<string>();
    for (const group of groups) {
      const page = await this.entries.find({ typeId: type.id, translationGroup: group, status: 'published', limit: 1 });
      if (page.items.length > 0) found.add(group);
    }
    return found;
  }
}

function requireVisitor(visitor: string): void {
  if (typeof visitor !== 'string' || !VISITOR.test(visitor)) {
    throw new ValidationError('A like needs a visitor: a hash of 64 hex letters, made by the site.', [{ path: ['visitor'], message: 'Not a visitor the site made.' }]);
  }
}
