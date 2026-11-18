import type { Actor, ContentTypeDef, Entry } from '@velocity-astro/cms-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connect, type Connection } from './connection.js';
import { menuLinksFrom } from './menu.js';

const owner: Actor = { kind: 'cli', id: 'installer', role: 'owner' };
const menu = { type: 'navigation', field: 'header' };
let connection: Connection;
let pages: ContentTypeDef;
let navigation: ContentTypeDef;
let story: Entry;

const page = async (locale: string, slug: string, title: string, extra: { translationGroup?: string; publish?: boolean } = {}) => {
  const { cms } = connection;
  const [name] = pages.fields;
  if (!name) throw new Error('The pages type is not as described.');
  const entry = await cms.content.create(owner, {
    typeId: pages.id,
    locale,
    slug,
    data: { [name.id]: title },
    ...(extra.translationGroup ? { translationGroup: extra.translationGroup } : {}),
  });
  return extra.publish === false ? entry : cms.content.publish(owner, entry.id);
};

interface Described {
  readonly id: string;
  readonly key: string;
  readonly type: string;
  readonly options: Record<string, unknown>;
}

/** Values written by key, as stored: by field id, following groups and lists down. */
const stored = (fields: readonly Described[], values: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(fields.filter((field) => values[field.key] !== undefined).map((field) => [field.id, storedValue(field.type, field.options, values[field.key])]));
const storedValue = (type: string, options: Record<string, unknown>, value: unknown): unknown => {
  if (type === 'group') return stored(options['fields'] as Described[], value as Record<string, unknown>);
  const of = options['of'] as { type: string; options: Record<string, unknown> } | undefined;
  return type === 'list' && of ? (value as unknown[]).map((item) => storedValue(of.type, of.options, item)) : value;
};

/** Saves the header menu from links written by key, as the editor's form would send them. */
const setMenu = async (locale: string, items: readonly { label: string; link: unknown; columns?: unknown }[], publish = true) => {
  const { cms } = connection;
  const data = stored(navigation.fields as unknown as Described[], { header: items });
  const entry = await cms.content.create(owner, { typeId: navigation.id, locale, slug: `menus-${locale}`, data });
  return publish ? cms.content.publish(owner, entry.id) : entry;
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
    fields: [{ key: 'title', type: 'text', label: { en: 'Title' }, required: true }],
  });
  navigation = await cms.schema.define(owner, {
    key: 'navigation',
    kind: 'single',
    label: { en: 'Navigation' },
    fields: [
      {
        key: 'header',
        type: 'list',
        label: { en: 'Header' },
        options: {
          of: {
            type: 'group',
            options: {
              fields: [
                { key: 'label', type: 'text', label: { en: 'Label' }, required: true },
                { key: 'link', type: 'link', label: { en: 'Link' }, required: true },
                {
                  key: 'columns',
                  type: 'list',
                  label: { en: 'Columns' },
                  options: {
                    of: {
                      type: 'group',
                      options: {
                        fields: [
                          { key: 'title', type: 'text', label: { en: 'Heading' } },
                          { key: 'show', type: 'select', label: { en: 'Shows' }, options: { choices: ['links', 'neighborhoods'] } },
                          {
                            key: 'links',
                            type: 'list',
                            label: { en: 'Links' },
                            options: {
                              of: {
                                type: 'group',
                                options: {
                                  fields: [
                                    { key: 'label', type: 'text', label: { en: 'Label' }, required: true },
                                    { key: 'link', type: 'link', label: { en: 'Link' }, required: true },
                                  ],
                                },
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  });
  story = await page('en', 'our-story', 'Our story');
});
afterEach(() => connection.close());

describe('a menu edited in the CMS', () => {
  it('gives its links in order: a page by its address today, an outside address as it was typed', async () => {
    await setMenu('en', [
      { label: 'Our story', link: { kind: 'entry', type: 'pages', entry: story.translationGroup } },
      { label: 'Listings', link: { kind: 'address', href: '/listings/' } },
      { label: 'Instagram', link: { kind: 'address', href: 'https://instagram.com/example' } },
    ]);
    expect(await menuLinksFrom(connection.cms, 'en', menu)).toEqual([
      { label: 'Our story', href: '/our-story/', external: false },
      { label: 'Listings', href: '/listings/', external: false },
      { label: 'Instagram', href: 'https://instagram.com/example', external: true },
    ]);
  });

  it('follows a page whose address changes, once the change is published', async () => {
    const { cms } = connection;
    await setMenu('en', [{ label: 'Our story', link: { kind: 'entry', type: 'pages', entry: story.translationGroup } }]);
    const saved = await cms.content.update(owner, story.id, { slug: 'about-us', expectedRevision: story.revision });
    expect(await menuLinksFrom(cms, 'en', menu)).toMatchObject([{ href: '/our-story/' }]);
    await cms.content.publish(owner, saved.id);
    expect(await menuLinksFrom(cms, 'en', menu)).toMatchObject([{ href: '/about-us/' }]);
  });

  it('is read in the page\'s language, and links to each page in that language when it has one', async () => {
    const { cms } = connection;
    const contact = await page('en', 'contact', 'Contact');
    await page('es', 'nuestra-historia', 'Nuestra historia', { translationGroup: story.translationGroup });
    await setMenu('en', [{ label: 'Our story', link: { kind: 'entry', type: 'pages', entry: story.translationGroup } }]);
    await setMenu('es', [
      { label: 'Nuestra historia', link: { kind: 'entry', type: 'pages', entry: story.translationGroup } },
      { label: 'Contacto', link: { kind: 'entry', type: 'pages', entry: contact.translationGroup } },
    ]);
    expect(await menuLinksFrom(cms, 'es', menu)).toEqual([
      { label: 'Nuestra historia', href: '/es/nuestra-historia/', external: false },
      // No Spanish version yet: the page in the first language is better than no link.
      { label: 'Contacto', href: '/contact/', external: false },
    ]);
    expect(await menuLinksFrom(cms, 'en', menu)).toEqual([{ label: 'Our story', href: '/our-story/', external: false }]);
    // A language with no menu of its own keeps the template's links.
    expect(await menuLinksFrom(cms, 'fr', menu)).toEqual([]);
  });

  it('leaves out a link to a page that is not published, and shows no draft of the menu itself', async () => {
    const { cms } = connection;
    const draft = await page('en', 'coming-soon', 'Coming soon', { publish: false });
    const saved = await setMenu('en', [
      { label: 'Soon', link: { kind: 'entry', type: 'pages', entry: draft.translationGroup } },
      { label: 'Gone', link: { kind: 'entry', type: 'pages', entry: 'nobody' } },
      { label: 'Contact', link: { kind: 'address', href: '/contact/' } },
    ], false);
    expect(await menuLinksFrom(cms, 'en', menu)).toEqual([]);
    expect(await menuLinksFrom(cms, 'en', menu, true)).toMatchObject([{ label: 'Soon', href: '/coming-soon/' }, { label: 'Contact' }]);
    await cms.content.publish(owner, saved.id);
    expect(await menuLinksFrom(cms, 'en', menu)).toEqual([{ label: 'Contact', href: '/contact/', external: false }]);
  });

  it('gives a link its columns, each with its own links, for a menu that opens under it', async () => {
    const draft = await page('en', 'coming-soon', 'Coming soon', { publish: false });
    const to = (entry: Entry) => ({ kind: 'entry', type: 'pages', entry: entry.translationGroup });
    await setMenu('en', [
      {
        label: 'Buy',
        link: { kind: 'address', href: '/homes-for-sale/' },
        columns: [
          { title: 'Search', show: 'links', links: [{ label: 'Our story', link: to(story) }, { label: 'Soon', link: to(draft) }] },
          { title: 'Neighborhoods', show: 'neighborhoods' },
          { title: 'Nothing yet', links: [{ label: 'Soon', link: to(draft) }] },
        ],
      },
      { label: 'About', link: to(story) },
    ]);
    expect(await menuLinksFrom(connection.cms, 'en', menu)).toEqual([
      {
        label: 'Buy',
        href: '/homes-for-sale/',
        external: false,
        columns: [
          // A link to a page that is not published is left out, here as anywhere.
          { title: 'Search', links: [{ label: 'Our story', href: '/our-story/', external: false }] },
          // A column the template fills says which, and needs no links of its own.
          { title: 'Neighborhoods', links: [], show: 'neighborhoods' },
          // A column with nothing to show is left out.
        ],
      },
      { label: 'About', href: '/our-story/', external: false },
    ]);
  });

  it('has no links when the site has no such menu', async () => {
    expect(await menuLinksFrom(connection.cms, 'en', menu)).toEqual([]);
    expect(await menuLinksFrom(connection.cms, 'en', { type: 'nothing', field: 'header' })).toEqual([]);
  });
});
