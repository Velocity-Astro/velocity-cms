import { and, eq, gt, lte } from 'drizzle-orm';
import type { Presence, PresenceStore } from '@velocity-astro/cms-core';
import type { Db } from './database.js';
import { entryPresence } from './tables.js';

export class SqlitePresenceStore implements PresenceStore {
  constructor(private readonly db: Db) {}

  async mark(presence: Presence, now: string): Promise<void> {
    // What ran out is cleared as marks are made, so the table stays as small as the team is.
    await this.db.delete(entryPresence).where(lte(entryPresence.until, now));
    await this.db
      .insert(entryPresence)
      .values(presence)
      .onConflictDoUpdate({ target: [entryPresence.entryId, entryPresence.actorId], set: { kind: presence.kind, name: presence.name, until: presence.until } });
  }

  async at(entryId: string, now: string): Promise<Presence[]> {
    return this.db
      .select()
      .from(entryPresence)
      .where(and(eq(entryPresence.entryId, entryId), gt(entryPresence.until, now)));
  }
}
