import { asc, eq, or } from 'drizzle-orm';
import { ConflictError, type MediaFile, type MediaRepository } from '@velocity-astro/cms-core';
import type { Db } from './database.js';
import { media } from './tables.js';

export class SqliteMediaRepository implements MediaRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<MediaFile[]> {
    return this.db.select().from(media).orderBy(asc(media.name));
  }

  async get(name: string): Promise<MediaFile | null> {
    const [row] = await this.db.select().from(media).where(eq(media.name, name)).limit(1);
    return row ?? null;
  }

  async add(file: MediaFile): Promise<MediaFile> {
    // The table's own rules decide, so two uploads at the same moment cannot both win.
    const added = await this.db.insert(media).values(file).onConflictDoNothing().returning({ name: media.name });
    if (added.length === 0) {
      const [other] = await this.db
        .select({ name: media.name })
        .from(media)
        .where(or(eq(media.name, file.name), eq(media.key, file.key)))
        .limit(1);
      throw new ConflictError(`Another image is already called "${other?.name ?? file.name}".`);
    }
    return file;
  }

  async remove(name: string): Promise<void> {
    await this.db.delete(media).where(eq(media.name, name));
  }
}
