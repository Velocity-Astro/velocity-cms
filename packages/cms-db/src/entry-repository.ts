import { and, asc, count, desc, eq, type SQL } from 'drizzle-orm';
import {
  ConflictError,
  type Entry,
  type EntryQuery,
  type EntryRepository,
  type Page,
  type Revision,
  type SaveOptions,
} from '@velocity/cms-core';
import type { Db } from './database.js';
import { entries, revisions } from './tables.js';

type EntryRow = typeof entries.$inferSelect;

const toEntry = ({ publishAt, ...row }: EntryRow): Entry => ({
  ...row,
  ...(publishAt !== null && { publishAt }),
});

const toRow = (entry: Entry): EntryRow => ({ ...entry, publishAt: entry.publishAt ?? null });

export class SqliteEntryRepository implements EntryRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<Entry | null> {
    const [row] = await this.db.select().from(entries).where(eq(entries.id, id)).limit(1);
    return row ? toEntry(row) : null;
  }

  async find(query: EntryQuery = {}): Promise<Page<Entry>> {
    const filters: SQL[] = [];
    if (query.typeId !== undefined) filters.push(eq(entries.typeId, query.typeId));
    if (query.locale !== undefined) filters.push(eq(entries.locale, query.locale));
    if (query.status !== undefined) filters.push(eq(entries.status, query.status));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await this.db
      .select()
      .from(entries)
      .where(where)
      .orderBy(asc(entries.createdAt), asc(entries.id))
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

      const [sameSlug] = await tx
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.typeId, entry.typeId), eq(entries.locale, entry.locale), eq(entries.slug, entry.slug)))
        .limit(1);
      if (sameSlug && sameSlug.id !== entry.id) {
        throw new ConflictError(`Another entry already uses the slug "${entry.slug}" in ${entry.locale}.`);
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
}
