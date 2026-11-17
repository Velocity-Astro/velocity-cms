import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { createCms } from '@velocity/cms-core';
import { entryRepositoryContract, schemaRepositoryContract, searchIndexContract } from '@velocity/cms-core/testing';
import { openDatabase, SqliteEntryRepository, SqliteSchemaRepository, SqliteSearchIndex, type Database } from './index.js';

const opened: Database[] = [];
const memory = async () => {
  const database = await openDatabase({ url: ':memory:' });
  opened.push(database);
  return database.db;
};
afterAll(() => opened.forEach((database) => database.close()));

entryRepositoryContract('SqliteEntryRepository', async () => new SqliteEntryRepository(await memory()));
schemaRepositoryContract('SqliteSchemaRepository', async () => new SqliteSchemaRepository(await memory()));
searchIndexContract('SqliteSearchIndex', async () => new SqliteSearchIndex(await memory()));

it('keeps content in a file between connections, and re-running migrations is harmless', async () => {
  const url = `file:${join(mkdtempSync(join(tmpdir(), 'cms-db-')), 'data.db')}`;
  const owner = { kind: 'cli', id: 'test', role: 'owner' } as const;

  const first = await openDatabase({ url });
  const cms = createCms({ entries: new SqliteEntryRepository(first.db), types: new SqliteSchemaRepository(first.db) });
  const type = await cms.schema.create(owner, {
    key: 'posts',
    kind: 'collection',
    label: { en: 'Posts' },
    fields: [{ key: 'title', type: 'text', label: { en: 'Title' }, required: true }],
  });
  const titleId = type.fields[0]?.id ?? '';
  const draft = await cms.content.create(owner, { typeId: type.id, locale: 'en', slug: 'hello', data: { [titleId]: 'Hello' } });
  await cms.content.publish(owner, draft.id);
  first.close();

  const second = await openDatabase({ url });
  const reopened = createCms({
    entries: new SqliteEntryRepository(second.db),
    types: new SqliteSchemaRepository(second.db),
  });
  const posts = await reopened.schema.getByKey('posts');
  const found = await reopened.content.find(owner, { typeId: posts.id, status: 'published' });
  expect(found.items.map((entry) => reopened.content.toPublic(posts, entry).data)).toEqual([{ title: 'Hello' }]);
  second.close();
});
