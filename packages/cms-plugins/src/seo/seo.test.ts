import { createCms, ValidationError, type Actor, type Cms, type ContentTypeDef } from '@velocity/cms-core';
import { FakeClock, InMemoryEntryRepository, InMemoryPluginStore, InMemorySchemaRepository, SequentialIds } from '@velocity/cms-core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { catalogue } from '../index.js';
import { analyse, type SeoConfig } from './analyse.js';
import { seo } from './plugin.js';

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const config: SeoConfig = { titleSuffix: ' | Lakeshore', descriptionKeys: ['description'], maxTitle: 60, maxDescription: 160, requireDescription: false };

let cms: Cms;
let listings: ContentTypeDef;
let notes: ContentTypeDef;
const id = (type: ContentTypeDef, key: string) => type.fields.find((field) => field.key === key)?.id ?? '';

beforeEach(async () => {
  cms = createCms({ pluginStore: new InMemoryPluginStore(), entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
  listings = await cms.schema.create(owner, {
    key: 'listings',
    kind: 'collection',
    label: { en: 'Listings' },
    fields: [
      { key: 'title', type: 'text', label: { en: 'Title' }, required: true },
      { key: 'description', type: 'text', label: { en: 'Description' } },
    ],
  });
  notes = await cms.schema.create(owner, { key: 'notes', kind: 'collection', label: { en: 'Notes' }, fields: [{ key: 'name', type: 'text', label: { en: 'Name' } }] });
  await cms.plugins.load(catalogue);
});

const settings = async (values: Record<string, unknown>) => {
  const { fields } = await cms.plugins.settings(owner, 'seo');
  await cms.plugins.saveSettings(owner, 'seo', Object.fromEntries(Object.entries(values).map(([key, value]) => [fields.find((field) => field.key === key)?.id ?? key, value])));
};

describe('how an entry reads in search results', () => {
  it('puts the ending on the title and finds the description by key', () => {
    const found = analyse(listings, { [id(listings, 'title')]: ' Lakeshore farmhouse ', [id(listings, 'description')]: 'Four bedrooms by the water.' }, config);
    expect(found).toEqual({ title: 'Lakeshore farmhouse | Lakeshore', description: 'Four bedrooms by the water.', descriptionKey: 'description', ownTitle: 'Lakeshore farmhouse', ownDescription: 'Four bedrooms by the water.', problems: [] });
  });

  it('says what is missing or too long', () => {
    expect(analyse(listings, {}, config).problems).toEqual(['no-title', 'no-description']);
    const long = analyse(listings, { [id(listings, 'title')]: 'x'.repeat(55), [id(listings, 'description')]: 'y'.repeat(161) }, config);
    expect(long.problems).toEqual(['long-title', 'long-description']);
  });

  it('goes by what was written for search engines, where something was', () => {
    const found = analyse(listings, { [id(listings, 'title')]: 'Farmhouse' }, config, { title: 'Lakeshore farmhouse for sale', description: 'Four bedrooms.' });
    expect(found).toMatchObject({ title: 'Lakeshore farmhouse for sale | Lakeshore', description: 'Four bedrooms.', ownTitle: 'Farmhouse', ownDescription: '', problems: [] });
  });

  it('does not count a description against a type that has no field for one', () => {
    expect(analyse(notes, { [id(notes, 'name')]: 'A note' }, config)).toMatchObject({ descriptionKey: null, problems: [] });
  });
});

describe('the SEO plugin', () => {
  it('comes with the CMS switched off, and an owner activates it', async () => {
    expect((await cms.plugins.list(owner))[0]).toMatchObject({ name: 'seo', status: 'off', hasSettings: true, hasEditor: true });
    expect(await cms.plugins.setEnabled(owner, 'seo', true)).toMatchObject({ status: 'on', adds: { checks: 1 } });
  });

  it('holds a publish back for a description only when the owner asked it to', async () => {
    await cms.plugins.setEnabled(owner, 'seo', true);
    const entry = await cms.content.create(owner, { typeId: listings.id, locale: 'en', slug: 'farmhouse', data: { [id(listings, 'title')]: 'Farmhouse' } });
    expect((await cms.content.publish(owner, entry.id)).status).toBe('published');

    await settings({ requireDescription: true });
    const second = await cms.content.create(owner, { typeId: listings.id, locale: 'en', slug: 'cottage', data: { [id(listings, 'title')]: 'Cottage' } });
    const refused = await cms.content.publish(owner, second.id).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ValidationError);
    expect((refused as ValidationError).issues).toEqual([{ path: ['description'], message: 'Write a description before publishing. Search engines show it under the page\'s title.' }]);

    // A type with no description field has nothing to fill in.
    const note = await cms.content.create(owner, { typeId: notes.id, locale: 'en', slug: 'a-note', data: { [id(notes, 'name')]: 'A note' } });
    expect((await cms.content.publish(owner, note.id)).status).toBe('published');
  });

  it('answers with its settings and a review of every entry, as the person who asked', async () => {
    await cms.plugins.setEnabled(owner, 'seo', true);
    await settings({ titleSuffix: ' | Lakeshore', maxDescription: 120 });
    await cms.content.create(owner, { typeId: listings.id, locale: 'en', slug: 'farmhouse', data: { [id(listings, 'title')]: 'Farmhouse' } });
    await cms.content.create(owner, { typeId: listings.id, locale: 'en', slug: 'cottage', data: { [id(listings, 'title')]: 'Cottage', [id(listings, 'description')]: 'By the lake.' } });

    const call = (path: string, actor = owner) => cms.plugins.call(actor, 'seo', 'GET', path, { query: {}, body: undefined });
    expect(await call('/config')).toEqual({ titleSuffix: ' | Lakeshore', descriptionKeys: ['description', 'summary', 'excerpt', 'intro'], maxTitle: 60, maxDescription: 120, requireDescription: false });
    expect(await call('/review')).toEqual({
      checked: 2,
      items: [{ id: expect.any(String) as string, typeKey: 'listings', typeLabel: 'Listings', name: 'Farmhouse', status: 'draft', problems: ['no-description'] }],
    });
    await expect(call('/review', { kind: 'user', id: 'nobody', role: 'unknown' as Actor['role'] })).rejects.toThrow();
  });

  it('keeps a search title, description and a hide switch per entry, saved by someone who may publish', async () => {
    await cms.plugins.setEnabled(owner, 'seo', true);
    const entry = await cms.content.create(owner, { typeId: listings.id, locale: 'en', slug: 'farmhouse', data: { [id(listings, 'title')]: 'Farmhouse' } });
    const author: Actor = { kind: 'user', id: 'ana', role: 'author' };
    const heard: string[] = [];
    cms.events.on('pages.changed', ({ plugin }) => void heard.push(plugin));
    const put = (body: unknown, actor = owner) => cms.plugins.call(actor, 'seo', 'PUT', `/entries/${entry.id}`, { query: {}, body });
    const get = (actor = owner) => cms.plugins.call(actor, 'seo', 'GET', `/entries/${entry.id}`, { query: {}, body: undefined });

    expect(await get()).toEqual({});
    await expect(put({ title: 'x' }, author)).rejects.toThrow(/does not allow/);
    await expect(put({ title: 'x'.repeat(201) })).rejects.toMatchObject({ issues: [{ path: ['title'], message: 'The search title can be at most 200 characters.' }] });
    await expect(put({ hidden: 'yes' })).rejects.toBeInstanceOf(ValidationError);
    expect(heard).toEqual([]);

    expect(await put({ title: ' Lakeshore farmhouse ', description: 'Four bedrooms by the water.', hidden: true, extra: 'left out' })).toEqual({ title: 'Lakeshore farmhouse', description: 'Four bedrooms by the water.', hidden: true });
    expect(await get(author)).toEqual({ title: 'Lakeshore farmhouse', description: 'Four bedrooms by the water.', hidden: true });
    expect(heard).toEqual(['seo']);
    // The review goes by what was written.
    expect(await cms.plugins.call(owner, 'seo', 'GET', '/review', { query: {}, body: undefined })).toMatchObject({ checked: 1, items: [] });
    // Emptied again, nothing is kept.
    expect(await put({ title: '', description: '', hidden: false })).toEqual({});
    await expect(cms.plugins.call(owner, 'seo', 'GET', '/entries/nothing', { query: {}, body: undefined })).rejects.toThrow();
  });

  it('writes it into the entry\'s page, with the owner\'s title ending, and leaves other pages alone', async () => {
    await cms.plugins.setEnabled(owner, 'seo', true);
    const entry = await cms.content.create(owner, { typeId: listings.id, locale: 'en', slug: 'farmhouse', data: { [id(listings, 'title')]: 'Farmhouse' } });
    const page = { path: '/listings/farmhouse/', locale: 'en', type: listings, entry: { id: entry.id, slug: 'farmhouse', locale: 'en', translationGroup: entry.translationGroup, data: { title: 'Farmhouse' } } };
    const template = { title: 'Farmhouse', description: 'From the template.' };

    expect(await cms.pages.run(page, template)).toEqual(template);
    await settings({ titleSuffix: ' | Lakeshore' });
    expect(await cms.pages.run(page, template)).toEqual({ ...template, fullTitle: 'Farmhouse | Lakeshore' });
    await cms.plugins.call(owner, 'seo', 'PUT', `/entries/${entry.id}`, { query: {}, body: { title: 'Lakeshore farmhouse', description: 'Four bedrooms.', hidden: true } });
    expect(await cms.pages.run(page, template)).toEqual({ title: 'Lakeshore farmhouse', fullTitle: 'Lakeshore farmhouse | Lakeshore', description: 'Four bedrooms.', noindex: true });
    expect(await cms.pages.run({ path: '/about/', locale: 'en' }, { title: 'About' })).toEqual({ title: 'About' });

    await cms.plugins.setEnabled(owner, 'seo', false);
    expect(await cms.pages.run(page, template)).toEqual(template);
  });

  it('sends the editor one module that stands alone and registers its panel and screen', async () => {
    const module = (await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(seo.editor ?? '')}`)) as { default: (api: unknown) => void };
    const registered: string[] = [];
    module.default({
      React: { createElement: () => null },
      ui: {},
      client: {},
      links: {},
      register: {
        screen: (screen: { id: string }) => registered.push(`screen:${screen.id}`),
        entryPanel: (panel: { id: string }) => registered.push(`panel:${panel.id}`),
        control: () => undefined,
      },
    });
    expect(registered).toEqual(['panel:preview', 'screen:review']);
  });
});
