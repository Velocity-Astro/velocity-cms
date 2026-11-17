import { asc, eq } from 'drizzle-orm';
import { ConflictError, type ContentTypeDef, type SchemaRepository } from '@velocity/cms-core';
import type { Db } from './database.js';
import { contentTypes } from './tables.js';

export class SqliteSchemaRepository implements SchemaRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<ContentTypeDef | null> {
    const [row] = await this.db.select().from(contentTypes).where(eq(contentTypes.id, id)).limit(1);
    return row?.definition ?? null;
  }

  async getByKey(key: string): Promise<ContentTypeDef | null> {
    const [row] = await this.db.select().from(contentTypes).where(eq(contentTypes.key, key)).limit(1);
    return row?.definition ?? null;
  }

  async list(): Promise<ContentTypeDef[]> {
    const rows = await this.db.select().from(contentTypes).orderBy(asc(contentTypes.key));
    return rows.map((row) => row.definition);
  }

  async save(type: ContentTypeDef): Promise<ContentTypeDef> {
    await this.db.transaction(async (tx) => {
      const [sameKey] = await tx
        .select({ id: contentTypes.id })
        .from(contentTypes)
        .where(eq(contentTypes.key, type.key))
        .limit(1);
      if (sameKey && sameKey.id !== type.id) {
        throw new ConflictError(`A content type with the key "${type.key}" already exists.`);
      }
      const row = { id: type.id, key: type.key, definition: type };
      await tx.insert(contentTypes).values(row).onConflictDoUpdate({ target: contentTypes.id, set: row });
    });
    return type;
  }
}
