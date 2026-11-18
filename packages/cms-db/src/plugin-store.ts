import { and, asc, eq, sql } from 'drizzle-orm';
import type { PluginStore } from '@velocity/cms-core';
import type { Db } from './database.js';
import { pluginData } from './tables.js';

export class SqlitePluginStore implements PluginStore {
  constructor(private readonly db: Db) {}

  async get(plugin: string, key: string): Promise<unknown> {
    const [row] = await this.db.select({ value: pluginData.value }).from(pluginData).where(this.#at(plugin, key)).limit(1);
    return row ? (JSON.parse(row.value) as unknown) : undefined;
  }

  async set(plugin: string, key: string, value: unknown): Promise<void> {
    const row = { plugin, key, value: JSON.stringify(value), updatedAt: new Date().toISOString() };
    await this.db
      .insert(pluginData)
      .values(row)
      .onConflictDoUpdate({ target: [pluginData.plugin, pluginData.key], set: { value: row.value, updatedAt: row.updatedAt } });
  }

  async remove(plugin: string, key: string): Promise<void> {
    await this.db.delete(pluginData).where(this.#at(plugin, key));
  }

  async list(plugin: string, prefix: string): Promise<[string, unknown][]> {
    // Compared as text from the start, not with LIKE: a prefix may hold `%` or `_`.
    const rows = await this.db
      .select({ key: pluginData.key, value: pluginData.value })
      .from(pluginData)
      .where(and(eq(pluginData.plugin, plugin), sql`substr(${pluginData.key}, 1, ${prefix.length}) = ${prefix}`))
      .orderBy(asc(pluginData.key));
    return rows.map((row) => [row.key, JSON.parse(row.value) as unknown]);
  }

  #at(plugin: string, key: string) {
    return and(eq(pluginData.plugin, plugin), eq(pluginData.key, key));
  }
}
