import { eq } from 'drizzle-orm';
import { ConflictError, type Pipeline, type PipelineStage, type PipelineStore } from '@velocity/cms-core';
import type { Db } from './database.js';
import { siteSettings } from './tables.js';

const KEY = 'pipeline';

export class SqlitePipelineStore implements PipelineStore {
  constructor(private readonly db: Db) {}

  async get(): Promise<Pipeline | null> {
    const [row] = await this.db.select().from(siteSettings).where(eq(siteSettings.key, KEY)).limit(1);
    if (!row) return null;
    // The first version kept the stages alone, as a list.
    const kept = Array.isArray(row.value) ? { stages: row.value as PipelineStage[] } : (row.value as Omit<Pipeline, 'revision'>);
    return { ...kept, revision: row.revision };
  }

  async save(pipeline: Pipeline, expectedRevision: number | null): Promise<Pipeline> {
    // The revision check and the write happen together or not at all.
    await this.db.transaction(async (tx) => {
      const [stored] = await tx.select({ revision: siteSettings.revision }).from(siteSettings).where(eq(siteSettings.key, KEY)).limit(1);
      if ((stored?.revision ?? null) !== expectedRevision) throw new ConflictError('The stages changed since they were read.');
      const { revision, ...kept } = pipeline;
      const row = { key: KEY, revision, value: kept };
      await tx.insert(siteSettings).values(row).onConflictDoUpdate({ target: siteSettings.key, set: { revision: row.revision, value: row.value } });
    });
    return pipeline;
  }
}
