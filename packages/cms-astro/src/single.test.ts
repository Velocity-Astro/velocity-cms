import type { Actor, ContentTypeDef } from '@velocity-astro/cms-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connect, type Connection } from './connection.js';
import { singleFrom } from './single.js';

const owner: Actor = { kind: 'cli', id: 'installer', role: 'owner' };
let connection: Connection;
let settings: ContentTypeDef;

const say = async (locale: string, values: Record<string, unknown>, publish = true) => {
  const { cms } = connection;
  const data = Object.fromEntries(settings.fields.filter((field) => values[field.key] !== undefined).map((field) => [field.id, values[field.key]]));
  const entry = await cms.content.create(owner, { typeId: settings.id, locale, slug: `settings-${locale}`, data });
  return publish ? cms.content.publish(owner, entry.id) : entry;
};

beforeEach(async () => {
  connection = await connect({ url: ':memory:' });
  settings = await connection.cms.schema.define(owner, {
    key: 'settings',
    kind: 'single',
    label: { en: 'Site settings' },
    fields: [
      { key: 'name', type: 'text', label: { en: 'Name' }, required: true },
      { key: 'phone', type: 'text', label: { en: 'Phone' } },
    ],
  });
  await connection.cms.schema.define(owner, {
    key: 'posts',
    kind: 'collection',
    label: { en: 'Posts' },
    urlPattern: '/posts/[slug]',
    fields: [{ key: 'title', type: 'text', label: { en: 'Title' }, required: true }],
  });
});

afterEach(() => connection.close());

describe('singleFrom', () => {
  it('answers with what is published, by field key', async () => {
    await say('en', { name: 'Oakhaven', phone: '555 0100' });
    expect(await singleFrom(connection.cms, 'en', 'settings')).toEqual({ name: 'Oakhaven', phone: '555 0100' });
  });

  it('has nothing before anything is published, and nothing for a type that is not there', async () => {
    await say('en', { name: 'Oakhaven' }, false);
    expect(await singleFrom(connection.cms, 'en', 'settings')).toBeUndefined();
    expect(await singleFrom(connection.cms, 'en', 'nothing')).toBeUndefined();
  });

  it('is not a way to read a collection', async () => {
    expect(await singleFrom(connection.cms, 'en', 'posts')).toBeUndefined();
  });

  it('keeps showing what was published while a change waits', async () => {
    const live = await say('en', { name: 'Oakhaven' });
    const [name] = settings.fields;
    if (!name) throw new Error('The settings type is not as described.');
    await connection.cms.content.update(owner, live.id, { data: { [name.id]: 'Harbor' }, expectedRevision: live.revision });
    expect((await singleFrom(connection.cms, 'en', 'settings'))?.['name']).toBe('Oakhaven');
    expect((await singleFrom(connection.cms, 'en', 'settings', true))?.['name']).toBe('Harbor');
  });

  it('reads the page\'s language first, and the first language when that one has none', async () => {
    await say('en', { name: 'Oakhaven' });
    expect((await singleFrom(connection.cms, 'es', 'settings'))?.['name']).toBe('Oakhaven');
    await say('es', { name: 'Oakhaven Casas' });
    expect((await singleFrom(connection.cms, 'es', 'settings'))?.['name']).toBe('Oakhaven Casas');
    expect((await singleFrom(connection.cms, 'en', 'settings'))?.['name']).toBe('Oakhaven');
  });
});
