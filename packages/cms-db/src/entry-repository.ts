import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lte, ne, or, type SQL } from 'drizzle-orm';
import {
  ConflictError,
  type Entry,
  type EntryQuery,
  type EntryRepository,
  type Page,
  type Revision,
  type SaveOptions,
} from '@velocity-astro/cms-core';
import type { Db } from './database.js';
import { entries, revisions } from './tables.js';

type EntryRow = typeof entries.$inferSelect;

const toEntry = ({ publishAt, publishProblem, publishedSlug, publishedData, publishedRevision, publishedAt, deletedAt, ...row }: EntryRow): Entry => ({
  ...row,
  ...(deletedAt !== null && { deletedAt }),
  ...(publishAt !== null && { publishAt }),
  ...(publishProblem !== null && { publishProblem }),
  ...(publishedSlug !== null &&
    publishedData !== null &&
    publishedRevision !== null &&
    publishedAt !== null && {
      published: { slug: publishedSlug, data: publishedData, revision: publishedRevision, at: publishedAt },
    }),
});

const toRow = ({ published, ...entry }: Entry): EntryRow => ({
  ...entry,
  publishAt: entry.publishAt ?? null,
  publishProblem: entry.publishProblem ?? null,
  deletedAt: entry.deletedAt ?? null,
  publishedSlug: published?.slug ?? null,
  publishedData: published?.data ?? null,
  publishedRevision: published?.revision ?? null,
  publishedAt: published?.at ?? null,
});

export class SqliteEntryRepository implements EntryRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<Entry | null> {
    const [row] = await this.db.select().from(entries).where(eq(entries.id, id)).limit(1);
    return row ? toEntry(row) : null;
  }

  async find(query: EntryQuery = {}): Promise<Page<Entry>> {
    const filters: SQL[] = [query.trashed === true ? isNotNull(entries.deletedAt) : isNull(entries.deletedAt)];
    if (query.typeId !== undefined) filters.push(eq(entries.typeId, query.typeId));
    if (query.locale !== undefined) filters.push(eq(entries.locale, query.locale));
    if (query.status !== undefined) filters.push(eq(entries.status, query.status));
    if (query.translationGroup !== undefined) filters.push(eq(entries.translationGroup, query.translationGroup));
    if (query.dueBy !== undefined) filters.push(lte(entries.publishAt, query.dueBy));
    if (query.slug !== undefined) filters.push(eq(entries.slug, query.slug));
    if (query.publishedSlug !== undefined) filters.push(eq(entries.publishedSlug, query.publishedSlug));
    const where = and(...filters);

    const rows = await this.db
      .select()
      .from(entries)
      .where(where)
      .orderBy(query.order === 'updated' ? desc(entries.updatedAt) : asc(entries.createdAt), asc(entries.id))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);
    const [counted] = await this.db.select({ total: count() }).from(entries).where(where);
    return { items: rows.map(toEntry), total: counted?.total ?? 0 };
  }

  async save(entry: Entry, options: SaveOptions): Promise<Entry> {
    // The revision check, the write and the history row happen together or not at all.
    await this.db.transaction(async (tx) => {
      const [stored] = await tx
        .select({ revision: entries.revision })
        .from(entries)
        .where(eq(entries.id, entry.id))
        .limit(1);
      if ((stored?.revision ?? null) !== options.expectedRevision) {
        throw new ConflictError(`Entry "${entry.id}" changed since it was read.`);
      }

      // An address belongs to one entry, whether that entry is working under it or showing it to visitors.
      const mine = entry.published ? [entry.slug, entry.published.slug] : [entry.slug];
      const [other] = entry.deletedAt !== undefined ? [] : await tx
        .select({ slug: entries.slug, publishedSlug: entries.publishedSlug })
        .from(entries)
        .where(
          and(
            isNull(entries.deletedAt),
            eq(entries.typeId, entry.typeId),
            eq(entries.locale, entry.locale),
            ne(entries.id, entry.id),
            or(inArray(entries.slug, mine), inArray(entries.publishedSlug, mine)),
          ),
        )
        .limit(1);
      if (other) {
        const taken = mine.includes(other.slug) ? other.slug : other.publishedSlug;
        throw new ConflictError(`Another entry already uses the slug "${taken}" in ${entry.locale}.`);
      }

      const row = toRow(entry);
      await tx.insert(entries).values(row).onConflictDoUpdate({ target: entries.id, set: row });
      await tx.insert(revisions).values({
        entryId: entry.id,
        revision: entry.revision,
        status: entry.status,
        data: entry.data,
        actorId: options.actorId,
        createdAt: entry.updatedAt,
      });
    });
    return entry;
  }

  history(id: string): Promise<Revision[]> {
    return this.db.select().from(revisions).where(eq(revisions.entryId, id)).orderBy(desc(revisions.revision));
  }

  async remove(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(revisions).where(eq(revisions.entryId, id));
      await tx.delete(entries).where(eq(entries.id, id));
    });
  }
}
