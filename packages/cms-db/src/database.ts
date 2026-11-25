import { fileURLToPath } from 'node:url';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as authTables from './auth-tables.js';
import { runBundledMigrations } from './bundled-migrate.js';
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
  /** A client made elsewhere, for a database that is not reached by an address (Cloudflare D1). */
  readonly client?: Client;
  /** Run the migrations bundled with the code, on a host with no disk to read them from. */
  readonly bundledMigrations?: boolean;
}

const migrationsDir = () => fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Opens the database and brings it up to date. Migrations only move forward and are safe to run
 * on every start: the ones already applied are skipped.
 */
export async function openDatabase(options: DatabaseOptions): Promise<Database> {
  const client: Client =
    options.client ??
    createClient({
      url: options.url,
      ...(options.authToken !== undefined && { authToken: options.authToken }),
    });
  const db = drizzle(client, { schema: tables });
  if (options.client || options.bundledMigrations) await runBundledMigrations(client);
  else await migrate(db, { migrationsFolder: migrationsDir() });
  return { db, close: () => client.close() };
}
