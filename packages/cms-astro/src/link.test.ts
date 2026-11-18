import type { Actor, ContentTypeDef, Entry } from '@velocity/cms-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connect, type Connection } from './connection.js';
import { linkResolver } from './link.js';

const owner: Actor = { kind: 'cli', id: 'installer', role: 'owner' };
let connection: Connection;
let pages: ContentTypeDef;
let story: Entry;

const page = async (locale: string, slug: string, extra: { translationGroup?: string } = {}) => {
  const [title] = pages.fields;
  if (!title) throw new Error('The pages type is not as described.');
  return connection.cms.content.create(owner, { typeId: pages.id, locale, slug, data: { [title.id]: slug }, ...extra });
};

beforeEach(async () => {
  connection = await connect({ url: ':memory:' });
  pages = await connection.cms.schema.define(owner, {
    key: 'pages',
    kind: 'collection',
    label: { en: 'Pages' },
    urlPattern: '/[slug]',
    localizedUrlPatterns: { es: '/es/[slug]' },
    fields: [{ key: 'title', type: 'text', label: { en: 'Title' }, required: true }],
  });
  story = await connection.cms.content.publish(owner, (await page('en', 'our-story')).id);
});
afterEach(() => connection.close());

describe('where a link leads', () => {
  it('is the address of the entry today, in the page\'s language when it has one', async () => {
    const { cms } = connection;
    const link = { kind: 'entry', type: 'pages', entry: story.translationGroup };
    expect(await linkResolver(cms, 'en')(link)).toEqual({ href: '/our-story/', external: false });
    expect(await linkResolver(cms, 'es')(link)).toEqual({ href: '/our-story/', external: false });
    await cms.content.publish(owner, (await page('es', 'nuestra-historia', { translationGroup: story.translationGroup })).id);
    expect(await linkResolver(cms, 'es')(link)).toEqual({ href: '/es/nuestra-historia/', external: false });
    const renamed = await cms.content.update(owner, story.id, { slug: 'about-us', expectedRevision: story.revision });
    await cms.content.publish(owner, renamed.id);
    expect(await linkResolver(cms, 'en')(link)).toEqual({ href: '/about-us/', external: false });
  });

  it('is nowhere for an entry that is not published, unless a preview asks', async () => {
    const { cms } = connection;
    const draft = await page('en', 'coming-soon');
    const link = { kind: 'entry', type: 'pages', entry: draft.translationGroup };
    expect(await linkResolver(cms, 'en')(link)).toBeUndefined();
    expect(await linkResolver(cms, 'en', true)(link)).toEqual({ href: '/coming-soon/', external: false });
    expect(await linkResolver(cms, 'en')({ kind: 'entry', type: 'pages', entry: 'gone' })).toBeUndefined();
    expect(await linkResolver(cms, 'en')({ kind: 'entry', type: 'nothing', entry: story.translationGroup })).toBeUndefined();
  });

  it('is a typed address as it was typed, and says when it leaves the site', async () => {
    const resolve = linkResolver(connection.cms, 'en');
    expect(await resolve({ kind: 'address', href: '/contact/' })).toEqual({ href: '/contact/', external: false });
    expect(await resolve({ kind: 'address', href: 'https://example.com' })).toEqual({ href: 'https://example.com', external: true });
    // An address kept from when the field was plain text.
    expect(await resolve(' /sell/ ')).toEqual({ href: '/sell/', external: false });
  });

  it('is nowhere for an address a site may not link to, or for anything that is not a link', async () => {
    const resolve = linkResolver(connection.cms, 'en');
    expect(await resolve({ kind: 'address', href: 'javascript:alert(1)' })).toBeUndefined();
    expect(await resolve('javascript:alert(1)')).toBeUndefined();
    expect(await resolve('')).toBeUndefined();
    expect(await resolve(undefined)).toBeUndefined();
    expect(await resolve({ kind: 'other' })).toBeUndefined();
  });
});
