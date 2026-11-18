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
    expect(found).toEqual({ title: 'Lakeshore farmhouse | Lakeshore', description: 'Four bedrooms by the water.', descriptionKey: 'description', problems: [] });
  });

  it('says what is missing or too long', () => {
    expect(analyse(listings, {}, config).problems).toEqual(['no-title', 'no-description']);
    const long = analyse(listings, { [id(listings, 'title')]: 'x'.repeat(55), [id(listings, 'description')]: 'y'.repeat(161) }, config);
    expect(long.problems).toEqual(['long-title', 'long-description']);
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
