import { defineBlock, type Actor, type BlockDef, type ContentTypeDef } from '@velocity/cms-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connect, type Connection } from './connection.js';
import { entryPageAt, publishedAddresses } from './entry-page.js';
import { liveAddresses } from './live-pages.js';

const owner: Actor = { kind: 'cli', id: 'installer', role: 'owner' };
const hero = defineBlock({ key: 'page-hero', label: { en: 'Page opening' }, fields: [{ key: 'title', type: 'text', label: { en: 'Title' }, required: true }] });
let connection: Connection;
let pages: ContentTypeDef;

const make = async (locale: string, slug: string, title: string, publish = true) => {
  const { cms } = connection;
  const [name, body] = pages.fields;
  const block = (body?.options['blocks'] as BlockDef[])[0];
  if (!name || !body || !block?.fields[0]) throw new Error('The pages type is not as described.');
  const entry = await cms.content.create(owner, {
    typeId: pages.id,
    locale,
    slug,
    data: { [name.id]: title, [body.id]: [{ id: 's1', block: block.id, data: { [block.fields[0].id]: title } }] },
  });
  if (publish) await cms.content.publish(owner, entry.id);
};

beforeEach(async () => {
  connection = await connect({ url: ':memory:' });
  const { cms } = connection;
  pages = await cms.schema.define(owner, {
    key: 'pages',
    kind: 'collection',
    label: { en: 'Pages' },
    urlPattern: '/[slug]',
    localizedUrlPatterns: { es: '/es/[slug]' },
    fields: [
      { key: 'title', type: 'text', label: { en: 'Title' }, required: true },
      { key: 'body', type: 'blocks', label: { en: 'Sections' }, options: { blocks: [hero] } },
    ],
  });
  await cms.schema.create(owner, { key: 'agents', kind: 'collection', label: { en: 'Agents' }, urlPattern: '/agents/[slug]', fields: [{ key: 'name', type: 'text', label: { en: 'Name' } }] });
  await make('en', 'our-story', 'Our story');
  await make('es', 'nuestra-historia', 'Nuestra historia');
  await make('en', 'coming-soon', 'Coming soon', false);
});
afterEach(() => connection.close());

describe('a page made in the editor', () => {
  it('is found by its address in each language, with its sections as the site draws them', async () => {
    expect(await entryPageAt(connection.cms, '/our-story/', ['pages'])).toEqual({
      type: 'pages',
      locale: 'en',
      entry: expect.objectContaining({ slug: 'our-story', data: { title: 'Our story', body: [{ id: 's1', block: 'page-hero', data: { title: 'Our story' } }] } }),
    });
    expect(await entryPageAt(connection.cms, '/es/nuestra-historia', ['pages'])).toMatchObject({ locale: 'es', entry: { slug: 'nuestra-historia' } });
  });

  it('is not there before it is published, at an address nobody made, or among types not asked for', async () => {
    expect(await entryPageAt(connection.cms, '/coming-soon/', ['pages'])).toBeUndefined();
    expect(await entryPageAt(connection.cms, '/nothing-here/', ['pages'])).toBeUndefined();
    expect(await entryPageAt(connection.cms, '/es/', ['pages'])).toBeUndefined();
    expect(await entryPageAt(connection.cms, '/our-story/', ['agents'])).toBeUndefined();
  });

  it('joins the site\'s addresses once published, after the pages the site has files for', async () => {
    const entries = await publishedAddresses(connection.cms, ['pages']);
    expect(entries.sort()).toEqual(['/es/nuestra-historia/', '/our-story/']);
    const all = await liveAddresses({ fixed: ['/src/pages/about.astro', '/src/pages/our-story.astro'], detail: {}, localized: {}, entries });
    expect(all).toEqual([
      { path: '/about/', fixed: true, listed: true },
      { path: '/es/nuestra-historia/', fixed: false, listed: true },
      { path: '/our-story/', fixed: true, listed: true },
    ]);
  });
});
