import { publicRichText, richTextSchema, type Actor, type ContentTypeDef, type Entry } from '@velocity-astro/cms-core';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { connect, type Connection } from './connection.js';
import { allowEmbeds, resolvedImage, withRichText } from './rich-text.js';

const owner: Actor = { kind: 'cli', id: 'installer', role: 'owner' };
let connection: Connection;
let pages: ContentTypeDef;
let story: Entry;

beforeEach(async () => {
  connection = await connect({ url: ':memory:' });
  pages = await connection.cms.schema.define(owner, {
    key: 'pages',
    kind: 'collection',
    label: { en: 'Pages' },
    urlPattern: '/[slug]',
    fields: [{ key: 'title', type: 'text', label: { en: 'Title' }, required: true }],
  });
  const [title] = pages.fields;
  if (!title) throw new Error('The pages type is not as described.');
  story = await connection.cms.content.publish(owner, (await connection.cms.content.create(owner, { typeId: pages.id, locale: 'en', slug: 'our-story', data: { [title.id]: 'Our story' } })).id);
});
afterEach(() => connection.close());

const words = (text: string, ...marks: object[]) => ({ type: 'text', text, ...(marks.length > 0 && { marks }) });
const drawn = (content: object[]) => publicRichText(richTextSchema.parse({ type: 'doc', content }));

it('leads a link to an entry where the entry is today, and keeps the words of one that is not published', async () => {
  const value = {
    title: 'Plain',
    body: drawn([{ type: 'paragraph', content: [words('Read '), words('our story', { type: 'link', attrs: { entryType: 'pages', entry: story.translationGroup } }), words(' or '), words('the draft', { type: 'link', attrs: { entryType: 'pages', entry: 'gone' } })] }]),
    cards: [{ text: drawn([{ type: 'paragraph', content: [words('Plain words')] }]) }],
  };
  const shown = await withRichText(connection.cms, value, 'en');
  expect(shown.title).toBe('Plain');
  expect(shown.body.html).toBe('<p>Read <a href="/our-story/">our story</a> or the draft</p>');
  expect(shown.cards[0]?.text.html).toBe('<p>Plain words</p>');
});

it('leaves out a picture the library does not have, and makes smaller copies of an upload', async () => {
  const shown = await withRichText(connection.cms, { body: drawn([{ type: 'image', attrs: { image: 'gone.webp', alt: '' } }, { type: 'paragraph', content: [words('After')] }]) }, 'en');
  expect(shown.body.html).toBe('<p>After</p>');
  expect(resolvedImage({ name: 'porch.webp', url: '/media/porch.webp', width: 1000, height: 500, thumbnail: '/media/porch.webp?w=400', uploadedAt: '2026-11-26T00:00:00.000Z' } as never)).toEqual({
    src: '/media/porch.webp',
    width: 1000,
    height: 500,
    srcset: '/media/porch.webp?w=320 320w, /media/porch.webp?w=640 640w, /media/porch.webp?w=960 960w, /media/porch.webp 1000w',
  });
});

it('adds where a video comes from to the page\'s policy', () => {
  const said: string[] = [];
  const page = { csp: { insertDirective: (directive: string) => said.push(directive) } };
  allowEmbeds(page, drawn([{ type: 'embed', attrs: { provider: 'youtube', id: 'dQw4w9WgXcQ', title: 'Tour' } }]), undefined, 'text');
  expect(said).toEqual(['frame-src https://www.youtube-nocookie.com']);
  allowEmbeds(page, drawn([{ type: 'paragraph', content: [words('None')] }]));
  expect(said).toHaveLength(1);
});
