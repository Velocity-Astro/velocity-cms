import { eq } from 'drizzle-orm';
import { ConflictError, type CustomFields, type CustomFieldsStore } from '@velocity-astro/cms-core';
import type { Db } from './database.js';
import { siteSettings } from './tables.js';

const KEY = 'custom-fields';

export class SqliteCustomFieldsStore implements CustomFieldsStore {
  constructor(private readonly db: Db) {}

  async get(): Promise<CustomFields | null> {
    const [row] = await this.db.select().from(siteSettings).where(eq(siteSettings.key, KEY)).limit(1);
    return row ? { ...(row.value as Omit<CustomFields, 'revision'>), revision: row.revision } : null;
  }

  async save(fields: CustomFields, expectedRevision: number | null): Promise<CustomFields> {
    // The revision check and the write happen together or not at all.
    await this.db.transaction(async (tx) => {
      const [stored] = await tx.select({ revision: siteSettings.revision }).from(siteSettings).where(eq(siteSettings.key, KEY)).limit(1);
      if ((stored?.revision ?? null) !== expectedRevision) throw new ConflictError('These fields changed since they were read.');
      const { revision, ...kept } = fields;
      await tx.insert(siteSettings).values({ key: KEY, revision, value: kept }).onConflictDoUpdate({ target: siteSettings.key, set: { revision, value: kept } });
    });
    return fields;
  }
}
