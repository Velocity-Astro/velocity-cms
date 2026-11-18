import { eq } from 'drizzle-orm';
import { ConflictError, type Pipeline, type PipelineStage, type PipelineStore } from '@velocity/cms-core';
import type { Db } from './database.js';
import { siteSettings } from './tables.js';

const KEY = 'pipeline';

export class SqlitePipelineStore implements PipelineStore {
  constructor(private readonly db: Db) {}

  async get(): Promise<Pipeline | null> {
    const [row] = await this.db.select().from(siteSettings).where(eq(siteSettings.key, KEY)).limit(1);
    return row ? { stages: row.value as PipelineStage[], revision: row.revision } : null;
  }

  async save(pipeline: Pipeline, expectedRevision: number | null): Promise<Pipeline> {
    // The revision check and the write happen together or not at all.
    await this.db.transaction(async (tx) => {
      const [stored] = await tx.select({ revision: siteSettings.revision }).from(siteSettings).where(eq(siteSettings.key, KEY)).limit(1);
      if ((stored?.revision ?? null) !== expectedRevision) throw new ConflictError('The stages changed since they were read.');
      const row = { key: KEY, revision: pipeline.revision, value: pipeline.stages };
      await tx.insert(siteSettings).values(row).onConflictDoUpdate({ target: siteSettings.key, set: { revision: row.revision, value: row.value } });
    });
    return pipeline;
  }
}
