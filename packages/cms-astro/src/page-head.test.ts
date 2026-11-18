import { definePlugin, type Actor, type ContentTypeDef } from '@velocity/cms-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connect, type Connection } from './connection.js';
import { pageAt } from './page-head.js';

const owner: Actor = { kind: 'cli', id: 'installer', role: 'owner' };
let connection: Connection;
let listings: ContentTypeDef;

beforeEach(async () => {
  connection = await connect({ url: ':memory:' });
  const { cms } = connection;
  listings = await cms.schema.create(owner, {
    key: 'listings',
    kind: 'collection',
    label: { en: 'Listings' },
    urlPattern: '/listings/[slug]',
    localizedUrlPatterns: { es: '/es/propiedades/[slug]' },
    fields: [{ key: 'title', type: 'text', label: { en: 'Title' } }],
  });
  await cms.schema.create(owner, { key: 'agents', kind: 'collection', label: { en: 'Agents' }, fields: [{ key: 'name', type: 'text', label: { en: 'Name' } }] });
  const title = listings.fields[0]?.id ?? '';
  const english = await cms.content.create(owner, { typeId: listings.id, locale: 'en', slug: 'oak-lane', data: { [title]: 'Oak Lane' } });
  await cms.content.publish(owner, english.id);
  const spanish = await cms.content.create(owner, { typeId: listings.id, locale: 'es', slug: 'calle-roble', data: { [title]: 'Calle Roble' } });
  await cms.content.publish(owner, spanish.id);
  await cms.content.create(owner, { typeId: listings.id, locale: 'en', slug: 'draft-house', data: { [title]: 'Draft house' } });
});
afterEach(() => connection.close());

describe('the entry a page is for', () => {
  const at = async (path: string) => pageAt(connection.cms, await connection.cms.schema.list(), path);

  it('is found from the page\'s address, in each language, with or without the last slash', async () => {
    expect(await at('/listings/oak-lane/')).toMatchObject({ locale: 'en', type: { key: 'listings' }, entry: { slug: 'oak-lane', data: { title: 'Oak Lane' } } });
    expect(await at('/listings/oak-lane')).toMatchObject({ entry: { slug: 'oak-lane' } });
    expect(await at('/es/propiedades/calle-roble/')).toMatchObject({ locale: 'es', entry: { data: { title: 'Calle Roble' } } });
  });

  it('is nobody\'s for any other page, and never a draft', async () => {
    for (const path of ['/', '/listings/', '/listings/nothing/', '/listings/oak-lane/photos/', '/about/', '/listings/draft-house/']) expect(await at(path)).toEqual({});
  });

  it('is what a plugin\'s rule is given, so it can speak for that entry alone', async () => {
    const { cms } = connection;
    await cms.plugins.load([
      definePlugin({ name: 'titles', apiVersion: 1, label: { en: 'Titles' }, setup: (plugin) => void plugin.pages.head(({ entry }) => (entry ? { title: `${String(entry.data['title'])}, for sale` } : undefined)) }),
    ]);
    expect(await cms.pages.run({ path: '/listings/oak-lane/', locale: 'en', ...(await at('/listings/oak-lane/')) }, { title: 'Oak Lane' })).toEqual({ title: 'Oak Lane, for sale' });
    expect(await cms.pages.run({ path: '/about/', locale: 'en', ...(await at('/about/')) }, { title: 'About' })).toEqual({ title: 'About' });
  });
});
