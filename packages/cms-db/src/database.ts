import { fileURLToPath } from 'node:url';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as authTables from './auth-tables.js';
import * as contentTables from './tables.js';

const tables = { ...contentTables, ...authTables };

export type Tables = typeof tables;
export type Db = LibSQLDatabase<Tables>;

export interface Database {
  readonly db: Db;
  /** Releases the connection. Call it when a script or a build step is done. */
  close(): void;
}

export interface DatabaseOptions {
  /**
   * Where the database is: `file:./cms/data.db` for a file on disk, `:memory:` for tests, or a
   * `libsql://` address for a hosted database.
   */
  readonly url: string;
  /** Needed for a hosted database. */
  readonly authToken?: string;
}

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Opens the database and brings it up to date. Migrations only move forward and are safe to run
 * on every start: the ones already applied are skipped.
 */
export async function openDatabase(options: DatabaseOptions): Promise<Database> {
  const client: Client = createClient({
    url: options.url,
    ...(options.authToken !== undefined && { authToken: options.authToken }),
  });
  const db = drizzle(client, { schema: tables });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => client.close() };
}
