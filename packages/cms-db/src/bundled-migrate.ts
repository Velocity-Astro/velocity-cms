import type { Client } from '@libsql/client';
import { MIGRATIONS } from './migrations.generated.js';

/**
 * Runs the migrations that were bundled with the code, for a host with no disk to read them from.
 * It keeps the same `__drizzle_migrations` table drizzle's own migrator keeps, so a database
 * moved between hosts is not migrated twice.
 */
export async function runBundledMigrations(client: Client): Promise<void> {
  await client.execute(
    'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)',
  );
  const last = await client.execute('SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1');
  const done = last.rows[0] ? Number(last.rows[0]['created_at']) : -1;
  for (const migration of MIGRATIONS) {
    if (migration.when <= done) continue;
    for (const statement of migration.statements) {
      if (statement.trim() !== '') await client.execute(statement);
    }
    await client.execute({ sql: 'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)', args: [migration.hash, migration.when] });
  }
}
