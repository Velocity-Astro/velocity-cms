import { eq } from 'drizzle-orm';
import { ConflictError, type SettingsStore } from '@velocity-astro/cms-core';
import type { Db } from './database.js';
import { siteSettings } from './tables.js';

/** Each part sits beside the pipeline in `site_settings`, under a name of its own. */
const keyOf = (area: string) => `settings:${area}`;

export class SqliteSettingsStore implements SettingsStore {
  constructor(private readonly db: Db) {}

  async get(area: string): Promise<{ value: unknown; revision: number } | null> {
    const [row] = await this.db.select().from(siteSettings).where(eq(siteSettings.key, keyOf(area))).limit(1);
    return row ? { value: row.value, revision: row.revision } : null;
  }

  async save(area: string, value: unknown, revision: number, expectedRevision: number | null): Promise<void> {
    const key = keyOf(area);
    // The revision check and the write happen together or not at all.
    await this.db.transaction(async (tx) => {
      const [stored] = await tx.select({ revision: siteSettings.revision }).from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
      if ((stored?.revision ?? null) !== expectedRevision) throw new ConflictError('These settings changed since they were read.');
      await tx.insert(siteSettings).values({ key, revision, value }).onConflictDoUpdate({ target: siteSettings.key, set: { revision, value } });
    });
  }
}
