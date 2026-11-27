import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type Client, type InValue } from '@libsql/client';
import { afterAll, describe, expect, it } from 'vitest';
import { ConflictError } from '@velocity-astro/cms-core';
import { contactRepositoryContract, dealRepositoryContract, pipelineStoreContract, presenceStoreContract, likeStoreContract, settingsStoreContract, customFieldsStoreContract, entryRepositoryContract, formRepositoryContract, submissionRepositoryContract, schemaRepositoryContract, mediaRepositoryContract, pluginStoreContract, searchIndexContract } from '@velocity-astro/cms-core/testing';
import { d1Client, openDatabase, SqliteEntryRepository, SqliteFormRepository, SqliteSubmissionRepository, SqliteContactRepository, SqliteDealRepository, SqlitePipelineStore, SqlitePresenceStore, SqliteLikeStore, SqliteSettingsStore, SqliteCustomFieldsStore, SqliteMediaRepository, SqlitePluginStore, SqliteSchemaRepository, SqliteSearchIndex, type D1Binding, type D1Statement, type Database } from './index.js';

/**
 * A stand-in for a D1 binding, over a SQLite database in memory. It keeps D1's two rules that
 * matter here: no statement may hold a transaction open, and a batch is kept whole or not at all.
 */
function fakeD1(client: Client): D1Binding & { batches: number } {
  const statement = (sql: string, args: unknown[] = []): D1Statement & { sql: string; args: unknown[] } => ({
    sql,
    args,
    bind: (...values: unknown[]) => statement(sql, values),
    raw: async () => {
      const result = await client.execute({ sql, args: args as InValue[] });
      return [result.columns, ...result.rows.map((row) => result.columns.map((_, index) => row[index]))];
    },
    run: async () => {
      const result = await client.execute({ sql, args: args as InValue[] });
      return { meta: { changes: result.rowsAffected, ...(result.lastInsertRowid !== undefined && { last_row_id: Number(result.lastInsertRowid) }) } };
    },
  });
  const binding = {
    batches: 0,
    prepare: (sql: string) => {
      if (/^\s*(begin|commit|rollback|savepoint|release)\b/i.test(sql)) throw new Error('D1_ERROR: a statement may not hold a transaction open.');
      return statement(sql);
    },
    batch: async (statements: D1Statement[]) => {
      binding.batches += 1;
      const results = await client.batch((statements as Array<D1Statement & { sql: string; args: unknown[] }>).map((one) => ({ sql: one.sql, args: one.args as InValue[] })), 'write');
      return results.map((result) => ({ results: [], meta: { changes: result.rowsAffected } }));
    },
  };
  return binding;
}

const opened: Database[] = [];
afterAll(() => opened.forEach((database) => database.close()));

const onD1 = async () => {
  const binding = fakeD1(createClient({ url: ':memory:' }));
  const database = await openDatabase({ url: 'd1:DB', client: d1Client(binding) });
  opened.push(database);
  return { db: database.db, binding };
};
const d1 = async () => (await onD1()).db;

entryRepositoryContract('SqliteEntryRepository on D1', async () => new SqliteEntryRepository(await d1()));
formRepositoryContract('SqliteFormRepository on D1', async () => new SqliteFormRepository(await d1()));
submissionRepositoryContract('SqliteSubmissionRepository on D1', async () => new SqliteSubmissionRepository(await d1()));
contactRepositoryContract('SqliteContactRepository on D1', async () => new SqliteContactRepository(await d1()));
dealRepositoryContract('SqliteDealRepository on D1', async () => new SqliteDealRepository(await d1()));
pipelineStoreContract('SqlitePipelineStore on D1', async () => new SqlitePipelineStore(await d1()));
presenceStoreContract('SqlitePresenceStore on D1', async () => new SqlitePresenceStore(await d1()));
likeStoreContract('SqliteLikeStore on D1', async () => new SqliteLikeStore(await d1()));
settingsStoreContract('SqliteSettingsStore on D1', async () => new SqliteSettingsStore(await d1()));
customFieldsStoreContract('SqliteCustomFieldsStore on D1', async () => new SqliteCustomFieldsStore(await d1()));
schemaRepositoryContract('SqliteSchemaRepository on D1', async () => new SqliteSchemaRepository(await d1()));
mediaRepositoryContract('SqliteMediaRepository on D1', async () => new SqliteMediaRepository(await d1()));
pluginStoreContract('SqlitePluginStore on D1', async () => new SqlitePluginStore(await d1()));
searchIndexContract('SqliteSearchIndex on D1', async () => new SqliteSearchIndex(await d1()));

describe('a transaction on D1', () => {
  const table = async () => {
    const raw = createClient({ url: ':memory:' });
    await raw.execute('CREATE TABLE notes (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, words TEXT NOT NULL)');
    await raw.execute("INSERT INTO notes VALUES ('a', 1, 'first')");
    return { raw, client: d1Client(fakeD1(raw)) };
  };
  const words = async (raw: Client) => (await raw.execute('SELECT id, revision, words FROM notes ORDER BY id')).rows.map((row) => `${String(row['id'])}:${String(row['revision'])}:${String(row['words'])}`);

  it('keeps every write on commit, and none of them before', async () => {
    const { raw, client } = await table();
    const tx = await client.transaction();
    await tx.execute({ sql: 'UPDATE notes SET revision = 2, words = ? WHERE id = ?', args: ['second', 'a'] });
    await tx.execute({ sql: 'INSERT INTO notes VALUES (?, 1, ?)', args: ['b', 'new'] });
    expect(await words(raw)).toEqual(['a:1:first']);
    await tx.commit();
    expect(await words(raw)).toEqual(['a:2:second', 'b:1:new']);
  });

  it('keeps nothing when one write fails', async () => {
    const { raw, client } = await table();
    const tx = await client.transaction();
    await tx.execute({ sql: 'UPDATE notes SET words = ? WHERE id = ?', args: ['changed', 'a'] });
    await tx.execute("INSERT INTO notes VALUES ('a', 1, 'the same id again')");
    await expect(tx.commit()).rejects.toThrow();
    expect(await words(raw)).toEqual(['a:1:first']);
  });

  it('keeps nothing after a rollback', async () => {
    const { raw, client } = await table();
    const tx = await client.transaction();
    await tx.execute("UPDATE notes SET words = 'changed' WHERE id = 'a'");
    await tx.rollback();
    expect(await words(raw)).toEqual(['a:1:first']);
  });

  it('refuses to save over a change made after it read', async () => {
    const { raw, client } = await table();
    const tx = await client.transaction();
    const before = await tx.execute({ sql: 'SELECT revision FROM notes WHERE id = ? LIMIT 1', args: ['a'] });
    expect(before.rows[0]?.['revision']).toBe(1);
    // Someone else saves between this transaction's read and its commit.
    await raw.execute("UPDATE notes SET revision = 2, words = 'theirs' WHERE id = 'a'");
    await tx.execute({ sql: 'UPDATE notes SET revision = 2, words = ? WHERE id = ?', args: ['mine', 'a'] });
    await expect(tx.commit()).rejects.toBeInstanceOf(ConflictError);
    expect(await words(raw)).toEqual(['a:2:theirs']);
  });

  it('refuses when a row it found missing was added meanwhile', async () => {
    const { raw, client } = await table();
    const tx = await client.transaction();
    expect((await tx.execute({ sql: 'SELECT id FROM notes WHERE id = ?', args: ['b'] })).rows).toEqual([]);
    await raw.execute("INSERT INTO notes VALUES ('b', 1, 'theirs')");
    await tx.execute("INSERT INTO notes VALUES ('c', 1, 'mine')");
    await expect(tx.commit()).rejects.toBeInstanceOf(ConflictError);
    expect(await words(raw)).toEqual(['a:1:first', 'b:1:theirs']);
  });

  it('commits when what it read is unchanged, whatever else changed', async () => {
    const { raw, client } = await table();
    const tx = await client.transaction();
    await tx.execute({ sql: 'SELECT revision FROM notes WHERE id = ? LIMIT 1', args: ['a'] });
    await raw.execute("INSERT INTO notes VALUES ('z', 1, 'elsewhere')");
    await tx.execute("UPDATE notes SET revision = 2, words = 'mine' WHERE id = 'a'");
    await tx.commit();
    expect(await words(raw)).toEqual(['a:2:mine', 'z:1:elsewhere']);
  });

  it('says what it cannot do, and never holds a transaction open', async () => {
    const { client } = await table();
    const tx = await client.transaction();
    await expect(tx.execute("UPDATE notes SET words = 'x' WHERE id = 'a' RETURNING id")).rejects.toThrow(/RETURNING/);
    await tx.execute("UPDATE notes SET words = 'x' WHERE id = 'a'");
    await expect(tx.execute('SELECT id FROM notes')).rejects.toThrow(/reads before it writes/);
    await expect(client.execute('BEGIN')).rejects.toThrow(/holds no transaction open/);
  });

  it('two saves of one entry at once: one is kept and the other is told', async () => {
    const { db } = await onD1();
    const entries = new SqliteEntryRepository(db);
    const entry = { id: 'e1', typeId: 't1', locale: 'en', translationGroup: 'e1', slug: 'hello', status: 'draft' as const, data: {}, revision: 1, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
    await entries.save(entry, { expectedRevision: null, actorId: 'me' });
    const saves = await Promise.allSettled([
      entries.save({ ...entry, revision: 2, slug: 'mine' }, { expectedRevision: 1, actorId: 'me' }),
      entries.save({ ...entry, revision: 2, slug: 'theirs' }, { expectedRevision: 1, actorId: 'them' }),
    ]);
    expect(saves.map((save) => save.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((saves.find((save) => save.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    expect((await entries.history('e1')).map((revision) => revision.revision)).toEqual([2, 1]);
  });
});

describe('the migrations bundled with the code', () => {
  it('are the ones in the migrations folder', () => {
    const script = fileURLToPath(new URL('../scripts/bundle-migrations.mjs', import.meta.url));
    const fresh = execFileSync(process.execPath, [script, '--print'], { encoding: 'utf8' });
    const kept = readFileSync(fileURLToPath(new URL('./migrations.generated.ts', import.meta.url)), 'utf8');
    expect(kept, 'Run `pnpm --filter @velocity-astro/cms-db migrations:bundle`.').toBe(fresh);
  });

  it('leave a database alone that the other way of migrating made, both ways round', async () => {
    const url = `file:${join(mkdtempSync(join(tmpdir(), 'cms-db-')), 'data.db')}`;
    const fromFolder = await openDatabase({ url });
    const tables = async (database: Database) => (await database.db.run("SELECT count(*) AS total FROM sqlite_master WHERE type = 'table'")).rows[0]?.['total'];
    const made = await tables(fromFolder);
    fromFolder.close();

    const bundled = await openDatabase({ url, bundledMigrations: true });
    expect(await tables(bundled)).toBe(made);
    expect((await bundled.db.run('SELECT count(*) AS total FROM __drizzle_migrations')).rows[0]?.['total']).toBe((await import('./migrations.generated.js')).MIGRATIONS.length);
    bundled.close();

    const other = `file:${join(mkdtempSync(join(tmpdir(), 'cms-db-')), 'data.db')}`;
    const first = await openDatabase({ url: other, bundledMigrations: true });
    first.close();
    const again = await openDatabase({ url: other });
    expect(await tables(again)).toBe(made);
    again.close();
  });
});
