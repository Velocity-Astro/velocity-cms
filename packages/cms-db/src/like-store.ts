import { and, count, desc, asc, eq, gte, inArray } from 'drizzle-orm';
import type { Like, LikeCount, LikeStore } from '@velocity-astro/cms-core';
import type { Db } from './database.js';
import { entryLikes } from './tables.js';

/** How many entries one question names at most, well under what SQLite takes in one statement. */
const AT_ONCE = 200;

export class SqliteLikeStore implements LikeStore {
  constructor(private readonly db: Db) {}

  async add(like: Like): Promise<boolean> {
    const added = await this.db.insert(entryLikes).values(like).onConflictDoNothing().returning({ visitor: entryLikes.visitor });
    return added.length > 0;
  }

  async remove(typeId: string, entry: string, visitor: string): Promise<boolean> {
    const gone = await this.db
      .delete(entryLikes)
      .where(and(eq(entryLikes.typeId, typeId), eq(entryLikes.entry, entry), eq(entryLikes.visitor, visitor)))
      .returning({ visitor: entryLikes.visitor });
    return gone.length > 0;
  }

  async has(typeId: string, entry: string, visitor: string): Promise<boolean> {
    const found = await this.db
      .select({ visitor: entryLikes.visitor })
      .from(entryLikes)
      .where(and(eq(entryLikes.typeId, typeId), eq(entryLikes.entry, entry), eq(entryLikes.visitor, visitor)))
      .limit(1);
    return found.length > 0;
  }

  async counts(typeId: string, entries?: readonly string[]): Promise<Record<string, number>> {
    if (entries !== undefined && entries.length === 0) return {};
    const parts = entries === undefined ? [undefined] : Array.from({ length: Math.ceil(entries.length / AT_ONCE) }, (_, index) => entries.slice(index * AT_ONCE, (index + 1) * AT_ONCE));
    const counts: Record<string, number> = {};
    for (const part of parts) {
      const rows = await this.db
        .select({ entry: entryLikes.entry, count: count() })
        .from(entryLikes)
        .where(part === undefined ? eq(entryLikes.typeId, typeId) : and(eq(entryLikes.typeId, typeId), inArray(entryLikes.entry, [...part])))
        .groupBy(entryLikes.entry);
      for (const row of rows) counts[row.entry] = Number(row.count);
    }
    return counts;
  }

  async top(limit: number, since?: string): Promise<LikeCount[]> {
    const counted = count();
    const rows = await this.db
      .select({ typeId: entryLikes.typeId, entry: entryLikes.entry, count: counted })
      .from(entryLikes)
      .where(since === undefined ? undefined : gte(entryLikes.at, since))
      .groupBy(entryLikes.typeId, entryLikes.entry)
      .orderBy(desc(counted), asc(entryLikes.typeId), asc(entryLikes.entry))
      .limit(limit);
    return rows.map((row) => ({ typeId: row.typeId, entry: row.entry, count: Number(row.count) }));
  }

  async clear(typeId: string, entry: string): Promise<void> {
    await this.db.delete(entryLikes).where(and(eq(entryLikes.typeId, typeId), eq(entryLikes.entry, entry)));
  }
}
