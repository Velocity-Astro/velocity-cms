import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Actor } from './access.js';
import { createCms, type Cms } from './cms.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import { FieldType } from './field-type.js';
import { hasUnpublishedChanges, type ContentTypeDef, type FieldDef } from './model.js';
import { pageAddress } from './page-address.js';
import { UnknownTypeError } from './registry.js';
import {
  FakeClock,
  InMemoryEntryRepository,
  InMemorySchemaRepository,
  InMemorySearchIndex,
  SequentialIds,
  entryRepositoryContract,
  schemaRepositoryContract,
  searchIndexContract,
} from './testing/index.js';

entryRepositoryContract('InMemoryEntryRepository', async () => new InMemoryEntryRepository());
schemaRepositoryContract('InMemorySchemaRepository', async () => new InMemorySchemaRepository());
searchIndexContract('InMemorySearchIndex', async () => new InMemorySearchIndex());

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const editor: Actor = { kind: 'user', id: 'daniel', role: 'editor' };
const author: Actor = { kind: 'user', id: 'priya', role: 'author' };

let cms: Cms;
let listings: ContentTypeDef;

/** The id of a field, looked up by key, so tests read like the site's code does. */
const id = (type: ContentTypeDef, key: string): string => {
  const field = type.fields.find((candidate) => candidate.key === key && candidate.deletedAt === undefined);
  if (!field) throw new Error(`No field "${key}"`);
  return field.id;
};

beforeEach(async () => {
  cms = createCms({
    entries: new InMemoryEntryRepository(),
    types: new InMemorySchemaRepository(),
    clock: new FakeClock(),
    ids: new SequentialIds(),
  });
  listings = await cms.schema.create(owner, {
    key: 'listings',
    kind: 'collection',
    label: { en: 'Listings' },
    urlPattern: '/listings/[slug]',
    fields: [
      { key: 'headline', type: 'text', label: { en: 'Headline' }, required: true, options: { maxLength: 80 } },
      { key: 'price', type: 'number', label: { en: 'Price' }, required: true, translated: false, options: { min: 0 } },
      { key: 'status', type: 'select', label: { en: 'Status' }, options: { choices: ['active', 'sold'] } },
      { key: 'photos', type: 'list', label: { en: 'Photos' }, options: { of: { type: 'text' }, min: 1 } },
    ],
  });
});

describe('SchemaService', () => {
  it('gives every field a permanent id and sensible defaults', () => {
    expect(listings.fields.map((field) => field.key)).toEqual(['headline', 'price', 'status', 'photos']);
    expect(new Set(listings.fields.map((field) => field.id)).size).toBe(4);
    expect(listings.fields[2]).toMatchObject({ translated: true, required: false });
  });

  it('refuses a field type nobody registered, and names the ones that exist', async () => {
    await expect(
      cms.schema.addField(owner, listings.id, { key: 'map', type: 'geo', label: { en: 'Map' } }),
    ).rejects.toThrowError(UnknownTypeError);
    await expect(
      cms.schema.addField(owner, listings.id, { key: 'map', type: 'geo', label: { en: 'Map' } }),
    ).rejects.toThrowError(/text/);
  });

  it('refuses settings the field type does not accept', async () => {
    await expect(
      cms.schema.addField(owner, listings.id, {
        key: 'kind',
        type: 'select',
        label: { en: 'Kind' },
        options: { choices: [] },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a duplicate or malformed key', async () => {
    await expect(
      cms.schema.addField(owner, listings.id, { key: 'price', type: 'number', label: { en: 'Price' } }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      cms.schema.addField(owner, listings.id, { key: 'Sale Price', type: 'number', label: { en: 'Price' } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('lets only an owner change the schema', async () => {
    await expect(
      cms.schema.addField(editor, listings.id, { key: 'beds', type: 'number', label: { en: 'Beds' } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('archives a content type without losing anything, and restores it', async () => {
    const draft = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'farmhouse', data: {} });
    const told: string[] = [];
    cms.events.on('type.archived', ({ type }) => void told.push(`archived ${type.key}`));
    cms.events.on('type.restored', ({ type }) => void told.push(`restored ${type.key}`));
    await expect(cms.schema.archive(editor, listings.id)).rejects.toBeInstanceOf(ForbiddenError);

    expect((await cms.schema.archive(owner, listings.id)).deletedAt).toBeTypeOf('string');
    expect(await cms.schema.list()).toEqual([]);
    expect((await cms.schema.listArchived(owner)).map((type) => type.key)).toEqual(['listings']);
    // Nothing about it changes while it is archived: not its fields, not its entries, not its key.
    await expect(cms.schema.addField(owner, listings.id, { key: 'beds', type: 'number', label: { en: 'Beds' } })).rejects.toBeInstanceOf(ConflictError);
    await expect(cms.content.update(editor, draft.id, { slug: 'farm', expectedRevision: 1 })).rejects.toBeInstanceOf(ConflictError);
    await expect(cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'another', data: {} })).rejects.toBeInstanceOf(ConflictError);
    await expect(cms.schema.create(owner, { key: 'listings', kind: 'collection', label: { en: 'Listings' } })).rejects.toThrow(/archived/);
    // A template that describes it again on the next deploy does not bring it back.
    expect((await cms.schema.define(owner, { key: 'listings', kind: 'collection', label: { en: 'Homes' } })).deletedAt).toBeTypeOf('string');

    const restored = await cms.schema.restore(owner, listings.id);
    expect(restored).not.toHaveProperty('deletedAt');
    expect(restored.fields.map((field) => field.key)).toEqual(listings.fields.map((field) => field.key));
    expect((await cms.content.get(editor, draft.id)).slug).toBe('farmhouse');
    expect(told).toEqual(['archived listings', 'restored listings']);
  });

  it('reports a missing content type', async () => {
    await expect(cms.schema.get('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(cms.schema.getByKey('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ContentService', () => {
  const valid = () => ({
    [id(listings, 'headline')]: 'Restored farmhouse on a corner lot',
    [id(listings, 'price')]: 629000,
    [id(listings, 'photos')]: ['front.jpg'],
  });

  it('saves a draft with required fields still empty', async () => {
    const draft = await cms.content.create(editor, {
      typeId: listings.id,
      locale: 'en',
      slug: 'farmhouse',
      data: { [id(listings, 'headline')]: 'Work in progress' },
    });
    expect(draft).toMatchObject({ status: 'draft', revision: 1, translationGroup: draft.id });
  });

  it('gives a single page one entry in each language, and no more', async () => {
    const about = await cms.schema.create(owner, { key: 'about', kind: 'single', label: { en: 'About' }, urlPattern: '/about' });
    const create = (locale: string, slug: string) => cms.content.create(editor, { typeId: about.id, locale, slug, data: {} });
    await create('en', 'about');
    await expect(create('en', 'about-again')).rejects.toMatchObject({ code: 'conflict' });
    await expect(create('es', 'about')).resolves.toMatchObject({ locale: 'es' });
  });

  it('takes a slug of several parts only where the type\'s address says [...slug]', async () => {
    const pages = await cms.schema.create(owner, { key: 'pages', kind: 'collection', label: { en: 'Pages' }, urlPattern: '/[...slug]', fields: [] });
    const create = (slug: string) => cms.content.create(editor, { typeId: pages.id, locale: 'en', slug, data: {} });
    const deep = await create('services/roofing');
    expect(pageAddress(pages, deep, 'en')).toBe('/services/roofing/');
    expect(pageAddress(pages, await create('services'), 'en')).toBe('/services/');
    // The page called index is the home page.
    expect(pageAddress(pages, await create('index'), 'en')).toBe('/');
    expect(pageAddress({ ...pages, localizedUrlPatterns: { es: '/es/[...slug]' } }, { locale: 'es', slug: 'index', data: {} }, 'en')).toBe('/es/');
    for (const slug of ['/services', 'services/', 'services//roofing', 'services/../admin', 'Services/Roofing', 'a/b/c/d/e/f']) {
      await expect(create(slug)).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['$slug'] }] });
    }
    // A type with one part to its address keeps to one.
    expect(pageAddress(listings, { locale: 'en', slug: 'a/b', data: {} }, 'en')).toBeNull();
  });

  it('refuses a slug that could not be part of an address', async () => {
    const create = (slug: string) => cms.content.create(editor, { typeId: listings.id, locale: 'en', slug, data: {} });
    for (const slug of ['', 'Farm House', '../admin', 'a/b', 'a--b', 'x'.repeat(201)]) {
      await expect(create(slug)).rejects.toMatchObject({ code: 'validation_failed', issues: [{ path: ['$slug'] }] });
    }
    const draft = await create('farm-house-2');
    await expect(cms.content.update(editor, draft.id, { slug: 'Nope!', expectedRevision: 1 })).rejects.toBeInstanceOf(ValidationError);
    expect((await cms.content.get(editor, draft.id)).slug).toBe('farm-house-2');
  });

  it('refuses a value of the wrong kind even in a draft, naming the field by key', async () => {
    const attempt = cms.content.create(editor, {
      typeId: listings.id,
      locale: 'en',
      slug: 'farmhouse',
      data: { [id(listings, 'price')]: 'a lot' },
    });
    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({ issues: [{ path: ['price'] }] });
  });

  it('refuses to publish until required fields are filled', async () => {
    const draft = await cms.content.create(editor, {
      typeId: listings.id,
      locale: 'en',
      slug: 'farmhouse',
      data: { [id(listings, 'headline')]: 'No price yet' },
    });
    // The message is for the person filling in the form, not the schema's own words.
    await expect(cms.content.publish(editor, draft.id)).rejects.toMatchObject({
      issues: [{ path: ['price'], message: 'Fill this in before publishing.' }],
    });

    const filled = await cms.content.update(editor, draft.id, { data: valid(), expectedRevision: 1 });
    const published = await cms.content.publish(editor, filled.id);
    expect(published).toMatchObject({ status: 'published', revision: 3 });
  });

  it('keeps what visitors see until the next publish, however the entry is edited', async () => {
    const draft = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'a', data: valid() });
    const live = await cms.content.publish(editor, draft.id);
    const before = cms.content.toPublic(listings, live);
    expect(hasUnpublishedChanges(live)).toBe(false);

    // Unfinished on purpose: the required price is gone, and the slug is new.
    const edited = await cms.content.update(editor, live.id, {
      data: { [id(listings, 'headline')]: 'Being rewritten' },
      slug: 'b',
      expectedRevision: live.revision,
    });
    expect(edited.status).toBe('published');
    expect(hasUnpublishedChanges(edited)).toBe(true);
    expect(cms.content.toPublic(listings, edited)).toEqual(before);
    expect(cms.content.toPublic(listings, edited, 'working')).toMatchObject({ slug: 'b', data: { headline: 'Being rewritten' } });

    const find = (slug: string, version?: 'working') =>
      cms.content.findBySlug(editor, { typeId: listings.id, locale: 'en', slug, ...(version && { version }) });
    expect((await find('a'))?.id).toBe(live.id);
    expect(await find('b')).toBeNull();
    expect((await find('b', 'working'))?.id).toBe(live.id);

    await expect(cms.content.publish(editor, edited.id)).rejects.toBeInstanceOf(ValidationError);
    const finished = await cms.content.update(editor, edited.id, { data: valid(), expectedRevision: edited.revision });
    const republished = await cms.content.publish(editor, finished.id);
    expect(cms.content.toPublic(listings, republished).slug).toBe('b');
    expect(hasUnpublishedChanges(republished)).toBe(false);
  });

  it('still reads an entry for visitors when a field has a type this code does not know', async () => {
    const draft = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'a', data: valid() });
    const live = await cms.content.publish(editor, draft.id);
    // What an older deploy sees after a newer one has changed the content type.
    const newer: ContentTypeDef = {
      ...listings,
      fields: listings.fields.map((field) => (field.key === 'headline' ? { ...field, type: 'from-the-future', options: {} } : field)),
    };
    const expected = cms.content.toPublic(listings, live);
    expect(cms.content.toPublic(newer, live)).toEqual(expected);
  });

  it('has nothing for visitors before the first publish or after an unpublish', async () => {
    const draft = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'a', data: valid() });
    expect(() => cms.content.toPublic(listings, draft)).toThrow(NotFoundError);
    const live = await cms.content.publish(editor, draft.id);
    const withdrawn = await cms.content.unpublish(editor, live.id);
    expect(withdrawn).not.toHaveProperty('published');
    expect(() => cms.content.toPublic(listings, withdrawn)).toThrow(NotFoundError);
  });

  describe('a copy', () => {
    it('is a draft of its own with what the original holds now, under a free slug', async () => {
      const draft = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'a', data: valid() });
      const live = await cms.content.publish(editor, draft.id);
      const copy = await cms.content.duplicate(author, live.id);
      expect(copy).toMatchObject({ typeId: listings.id, locale: 'en', slug: 'a-copy', status: 'draft', data: live.data, revision: 1 });
      expect(copy).not.toHaveProperty('published');
      // A page of its own, not a translation of the original.
      expect(copy.translationGroup).toBe(copy.id);
      expect(copy.id).not.toBe(live.id);
      expect((await cms.content.duplicate(author, live.id)).slug).toBe('a-copy-2');
      expect((await cms.content.duplicate(author, copy.id)).slug).toBe('a-copy-copy');
      // The original is as it was.
      expect(await cms.content.get(editor, live.id)).toEqual(live);
    });

    it('keeps a long slug within its length', async () => {
      const long = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'a'.repeat(200), data: valid() });
      expect((await cms.content.duplicate(editor, long.id)).slug).toBe(`${'a'.repeat(195)}-copy`);
    });

    it('is refused for a single page and for an entry in the trash', async () => {
      const about = await cms.schema.create(owner, { key: 'about', kind: 'single', label: { en: 'About' }, urlPattern: '/about' });
      const page = await cms.content.create(editor, { typeId: about.id, locale: 'en', slug: 'about', data: {} });
      await expect(cms.content.duplicate(editor, page.id)).rejects.toThrowError(/single page/);
      const draft = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'a', data: valid() });
      await cms.content.trash(editor, draft.id);
      await expect(cms.content.duplicate(editor, draft.id)).rejects.toThrowError(/in the trash/);
    });
  });

  describe('the trash', () => {
    const heard: string[] = [];
    const make = async (slug = 'a') => cms.content.create(editor, { typeId: listings.id, locale: 'en', slug, data: valid() });
    beforeEach(() => {
      heard.length = 0;
      for (const event of ['entry.unpublished', 'entry.trashed', 'entry.restored', 'entry.deleted'] as const) {
        cms.events.on(event, () => void heard.push(event));
      }
    });

    it('takes an entry off the site and out of the lists, and brings it back as a draft', async () => {
      const live = await cms.content.publish(editor, (await make()).id);
      const trashed = await cms.content.trash(editor, live.id);
      expect(trashed).toMatchObject({ status: 'draft', slug: 'a', data: live.data, revision: live.revision + 1 });
      expect(trashed.deletedAt).toBeDefined();
      expect(trashed).not.toHaveProperty('published');
      expect(heard).toEqual(['entry.unpublished', 'entry.trashed']);
      expect((await cms.content.find(editor, { typeId: listings.id })).total).toBe(0);
      expect((await cms.content.find(editor, { trashed: true })).items).toEqual([trashed]);
      expect(await cms.content.findBySlug(editor, { typeId: listings.id, locale: 'en', slug: 'a' })).toBeNull();
      // Asked twice, it is still in the trash and nothing more is said.
      expect(await cms.content.trash(editor, live.id)).toEqual(trashed);

      const restored = await cms.content.restore(editor, live.id);
      expect(restored).toMatchObject({ status: 'draft', slug: 'a', data: live.data });
      expect(restored).not.toHaveProperty('deletedAt');
      expect(heard).toEqual(['entry.unpublished', 'entry.trashed', 'entry.restored']);
      expect((await cms.content.find(editor, { typeId: listings.id })).total).toBe(1);
      expect((await cms.content.history(editor, live.id)).length).toBe(4);
    });

    it('refuses a change to an entry in the trash', async () => {
      const trashed = await cms.content.trash(editor, (await make()).id);
      const refused = /in the trash\. Restore it/;
      await expect(cms.content.update(editor, trashed.id, { slug: 'b', expectedRevision: trashed.revision })).rejects.toThrowError(refused);
      await expect(cms.content.publish(editor, trashed.id)).rejects.toThrowError(refused);
      await expect(cms.content.unpublish(editor, trashed.id)).rejects.toThrowError(refused);
    });

    it('frees the slug, and says so when a restore finds it taken', async () => {
      const first = await cms.content.trash(editor, (await make()).id);
      const second = await make();
      await expect(cms.content.restore(editor, first.id)).rejects.toThrowError(/Another entry uses the slug "a" now/);
      await cms.content.update(editor, second.id, { slug: 'b', expectedRevision: second.revision });
      expect(await cms.content.restore(editor, first.id)).toMatchObject({ slug: 'a' });
    });

    it('deletes for good only from the trash, and only for someone allowed to', async () => {
      const draft = await make();
      await expect(cms.content.delete(editor, draft.id)).rejects.toThrowError(/Move this entry to the trash first/);
      const trashed = await cms.content.trash(author, draft.id);
      await expect(cms.content.delete(author, trashed.id)).rejects.toBeInstanceOf(ForbiddenError);
      await cms.content.delete(editor, trashed.id);
      expect(heard).toEqual(['entry.trashed', 'entry.deleted']);
      await expect(cms.content.get(editor, trashed.id)).rejects.toBeInstanceOf(NotFoundError);
      expect((await cms.content.find(editor, { trashed: true })).total).toBe(0);
    });

    it('lets an author trash a draft, but not take a page off the site', async () => {
      const live = await cms.content.publish(editor, (await make()).id);
      await expect(cms.content.trash(author, live.id)).rejects.toBeInstanceOf(ForbiddenError);
      expect((await cms.content.get(editor, live.id)).status).toBe('published');
    });
  });

  it('lets an author write but not publish', async () => {
    const draft = await cms.content.create(author, { typeId: listings.id, locale: 'en', slug: 'a', data: valid() });
    await expect(cms.content.publish(author, draft.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('stops the second of two people saving the same revision', async () => {
    const draft = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'a', data: valid() });
    await cms.content.update(editor, draft.id, { slug: 'first-save', expectedRevision: 1 });
    await expect(
      cms.content.update(author, draft.id, { slug: 'second-save', expectedRevision: 1 }),
    ).rejects.toThrowError(/saved by someone else/);
  });

  it('records who saved each revision', async () => {
    const draft = await cms.content.create(author, { typeId: listings.id, locale: 'en', slug: 'a', data: valid() });
    await cms.content.publish(editor, draft.id);
    const history = await cms.content.history(editor, draft.id);
    expect(history.map((revision) => [revision.revision, revision.status, revision.actorId])).toEqual([
      [2, 'published', 'daniel'],
      [1, 'draft', 'priya'],
    ]);
  });

  it('announces saves and publishes to listeners', async () => {
    const heard: string[] = [];
    cms.events.on('entry.saved', ({ entry }) => void heard.push(`saved:${entry.revision}`));
    cms.events.on('entry.published', ({ entry, actor }) => void heard.push(`published:${entry.slug}:${actor.id}`));
    const draft = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'a', data: valid() });
    await cms.content.publish(editor, draft.id);
    expect(heard).toEqual(['saved:1', 'published:a:daniel']);
  });

  it('hands the site values keyed by field key', async () => {
    const draft = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'a', data: valid() });
    expect(cms.content.toPublic(listings, draft, 'working').data).toEqual({
      headline: 'Restored farmhouse on a corner lot',
      price: 629000,
      photos: ['front.jpg'],
    });
  });
});

describe('schema changes are safe for existing content', () => {
  const create = () =>
    cms.content.create(editor, {
      typeId: listings.id,
      locale: 'en',
      slug: 'farmhouse',
      data: {
        [id(listings, 'headline')]: 'Restored farmhouse',
        [id(listings, 'price')]: 629000,
        [id(listings, 'photos')]: ['front.jpg'],
      },
    });

  it('keeps the value when a field is renamed', async () => {
    const entry = await create();
    const renamed = await cms.schema.renameField(owner, listings.id, id(listings, 'headline'), { key: 'title' });
    expect(cms.content.toPublic(renamed, entry, 'working').data).toMatchObject({ title: 'Restored farmhouse' });
    expect(cms.content.toPublic(renamed, entry, 'working').data).not.toHaveProperty('headline');
  });

  it('hides a removed field but keeps its data through later saves, so restoring brings it back', async () => {
    const entry = await create();
    const priceId = id(listings, 'price');

    const without = await cms.schema.removeField(owner, listings.id, priceId);
    expect(cms.content.toPublic(without, entry, 'working').data).not.toHaveProperty('price');

    // An edit made while the field is gone does not send the field, and must not erase it.
    const edited = await cms.content.update(editor, entry.id, {
      data: { [id(without, 'headline')]: 'Edited while price was removed', [id(without, 'photos')]: ['front.jpg'] },
      expectedRevision: 1,
    });
    expect(edited.data[priceId]).toBe(629000);

    const restored = await cms.schema.restoreField(owner, listings.id, priceId);
    expect(cms.content.toPublic(restored, edited, 'working').data).toMatchObject({
      headline: 'Edited while price was removed',
      price: 629000,
    });
  });

  it('frees a removed field key for a new field, which starts empty', async () => {
    const entry = await create();
    const oldId = id(listings, 'price');
    await cms.schema.removeField(owner, listings.id, oldId);
    const next = await cms.schema.addField(owner, listings.id, { key: 'price', type: 'number', label: { en: 'Price' } });
    expect(id(next, 'price')).not.toBe(oldId);
    expect(cms.content.toPublic(next, entry, 'working').data).not.toHaveProperty('price');
    await expect(cms.schema.restoreField(owner, listings.id, oldId)).rejects.toBeInstanceOf(ConflictError);
  });

  it('lets a draft be published after a new required field is added and filled', async () => {
    const entry = await create();
    const next = await cms.schema.addField(owner, listings.id, {
      key: 'beds',
      type: 'number',
      label: { en: 'Beds' },
      required: true,
    });
    await expect(cms.content.publish(editor, entry.id)).rejects.toMatchObject({ issues: [{ path: ['beds'] }] });
    const filled = await cms.content.update(editor, entry.id, {
      data: { ...entry.data, [id(next, 'beds')]: 3 },
      expectedRevision: 1,
    });
    expect((await cms.content.publish(editor, filled.id)).status).toBe('published');
  });
});

describe('fields that hold other fields', () => {
  const sub = (fieldId: string, key: string, required = false): FieldDef => ({
    id: fieldId,
    key,
    type: 'text',
    label: { en: key },
    translated: false,
    required,
    options: {},
  });

  it('validates a group and a list of groups, and reports problems by key', async () => {
    const agents = await cms.schema.create(owner, {
      key: 'agents',
      kind: 'collection',
      label: { en: 'Agents' },
      fields: [
        {
          key: 'address',
          type: 'group',
          label: { en: 'Address' },
          options: { fields: [sub('a-street', 'street', true), sub('a-city', 'city', true)] },
        },
        {
          key: 'awards',
          type: 'list',
          label: { en: 'Awards' },
          options: { of: { type: 'group', options: { fields: [sub('w-name', 'name', true), sub('w-year', 'year')] } } },
        },
      ],
    });
    const entry = await cms.content.create(editor, {
      typeId: agents.id,
      locale: 'en',
      slug: 'maya',
      data: {
        [id(agents, 'address')]: { 'a-street': '12 Elm St' },
        [id(agents, 'awards')]: [{ 'w-name': 'Top seller', 'w-year': '2025' }, { 'w-year': '2026' }],
      },
    });

    await expect(cms.content.publish(editor, entry.id)).rejects.toMatchObject({
      issues: [{ path: ['address', 'city'] }, { path: ['awards', 1, 'name'] }],
    });
    expect(cms.content.toPublic(agents, entry, 'working').data).toEqual({
      address: { street: '12 Elm St' },
      awards: [{ name: 'Top seller', year: '2025' }, { year: '2026' }],
    });
  });
});

describe('extending with a new field type', () => {
  class RatingField extends FieldType<number, { max: number }> {
    readonly type = 'rating';
    readonly editor = 'rating-input';
    readonly options = z.object({ max: z.number().int().positive().default(5) });
    schema({ max }: { max: number }) {
      return z.number().int().min(1).max(max);
    }
  }

  it('works like a built-in once registered', async () => {
    cms.fields.register(new RatingField());
    const reviews = await cms.schema.create(owner, {
      key: 'reviews',
      kind: 'collection',
      label: { en: 'Reviews' },
      fields: [{ key: 'stars', type: 'rating', label: { en: 'Stars' }, required: true }],
    });
    await expect(
      cms.content.create(editor, { typeId: reviews.id, locale: 'en', slug: 'r1', data: { [id(reviews, 'stars')]: 6 } }),
    ).rejects.toBeInstanceOf(ValidationError);
    const ok = await cms.content.create(editor, {
      typeId: reviews.id,
      locale: 'en',
      slug: 'r1',
      data: { [id(reviews, 'stars')]: 5 },
    });
    expect(cms.content.toPublic(reviews, ok, 'working').data).toEqual({ stars: 5 });
  });

  it('refuses a second field type with the same name', () => {
    cms.fields.register(new RatingField());
    expect(() => cms.fields.register(new RatingField())).toThrowError(ConflictError);
  });
});

describe('a link to another entry', () => {
  it('holds the slug of an entry, and needs to know which type it points into', async () => {
    const reviews = await cms.schema.create(owner, {
      key: 'reviews',
      kind: 'collection',
      label: { en: 'Reviews' },
      fields: [{ key: 'listing', type: 'reference', label: { en: 'Listing' }, options: { to: 'listings' } }],
    });
    const review = await cms.content.create(owner, { typeId: reviews.id, locale: 'en', slug: 'r1', data: { [id(reviews, 'listing')]: 'lakeshore-farmhouse' } });
    expect(cms.content.toPublic(reviews, review, 'working').data).toEqual({ listing: 'lakeshore-farmhouse' });
    await expect(
      cms.schema.addField(owner, reviews.id, { key: 'agent', type: 'reference', label: { en: 'Agent' } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('describing a content type again', () => {
  const agents = {
    key: 'agents',
    kind: 'collection' as const,
    label: { en: 'Agents' },
    fields: [
      { key: 'name', type: 'text', label: { en: 'Name' }, required: true },
      { key: 'phone', type: 'group', label: { en: 'Phone' }, options: { fields: [{ key: 'display', type: 'text', label: { en: 'Number' } }] } },
      { key: 'kind', type: 'text', label: { en: 'Kind' } },
    ],
  };

  it('creates the type when it is not there', async () => {
    const type = await cms.schema.define(owner, agents);
    expect(type.fields.map((field) => field.key)).toEqual(['name', 'phone', 'kind']);
    expect((type.fields[1]?.options['fields'] as FieldDef[])[0]?.id).toBeTypeOf('string');
  });

  it('keeps every field id, so content stays, while labels, types, order and help change', async () => {
    const before = await cms.schema.define(owner, agents);
    const entry = await cms.content.create(owner, {
      typeId: before.id,
      locale: 'en',
      slug: 'maya',
      data: { [id(before, 'name')]: 'Maya', [id(before, 'kind')]: 'selling' },
    });

    const after = await cms.schema.define(owner, {
      ...agents,
      label: { en: 'Team' },
      fields: [
        { key: 'kind', type: 'select', label: { en: 'Works on' }, help: { en: 'Used by the filter.' }, options: { choices: ['buying', 'selling'] } },
        { key: 'name', type: 'text', label: { en: 'Full name' }, required: true },
        { key: 'phone', type: 'group', label: { en: 'Phone' }, options: { fields: [{ key: 'display', type: 'text', label: { en: 'As shown' } }] } },
      ],
    });

    expect(after.id).toBe(before.id);
    expect(after.label).toEqual({ en: 'Team' });
    expect(after.fields.map((field) => field.key)).toEqual(['kind', 'name', 'phone']);
    expect(id(after, 'name')).toBe(id(before, 'name'));
    expect(id(after, 'kind')).toBe(id(before, 'kind'));
    expect(after.fields[0]).toMatchObject({ type: 'select', help: { en: 'Used by the filter.' } });
    const inner = (type: ContentTypeDef) => (type.fields.find((field) => field.key === 'phone')?.options['fields'] as FieldDef[])[0];
    expect(inner(after)?.id).toBe(inner(before)?.id);
    expect(inner(after)?.label).toEqual({ en: 'As shown' });
    expect((await cms.content.get(owner, entry.id)).data[id(after, 'kind')]).toBe('selling');
  });

  it('keeps a field the description leaves out, after the described ones', async () => {
    const before = await cms.schema.define(owner, agents);
    const after = await cms.schema.define(owner, { ...agents, fields: agents.fields.slice(0, 1) });
    expect(after.fields.map((field) => field.key)).toEqual(['name', 'phone', 'kind']);
    expect(id(after, 'kind')).toBe(id(before, 'kind'));
  });

  it('stores the title field and the sections by field id', async () => {
    const type = await cms.schema.define(owner, {
      ...agents,
      titleField: 'phone.display',
      sections: [
        { key: 'about', label: { en: 'About' }, fields: ['name', 'kind'] },
        { key: 'site', label: { en: 'On the site' }, fields: ['phone'], aside: true },
      ],
    });
    const phone = type.fields.find((field) => field.key === 'phone');
    expect(type.titlePath).toEqual([phone?.id, (phone?.options['fields'] as FieldDef[])[0]?.id]);
    expect(type.sections).toEqual([
      { key: 'about', label: { en: 'About' }, fieldIds: [id(type, 'name'), id(type, 'kind')] },
      { key: 'site', label: { en: 'On the site' }, fieldIds: [id(type, 'phone')], aside: true },
    ]);
  });

  it('stores what a list of entries shows by field id, and refuses a field the type does not have', async () => {
    const type = await cms.schema.define(owner, { ...agents, listImage: 'name', listFields: ['kind', 'phone.display'] });
    const phone = type.fields.find((field) => field.key === 'phone');
    expect(type.list).toEqual({
      imagePath: [id(type, 'name')],
      fieldPaths: [[id(type, 'kind')], [phone?.id, (phone?.options['fields'] as FieldDef[])[0]?.id]],
    });
    expect((await cms.schema.define(owner, agents)).list).toBeUndefined();
    await expect(cms.schema.define(owner, { ...agents, listFields: ['nickname'] })).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a section or a title that names a field the type does not have', async () => {
    await expect(cms.schema.define(owner, { ...agents, titleField: 'nickname' })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      cms.schema.define(owner, { ...agents, sections: [{ key: 'about', label: { en: 'About' }, fields: ['nickname'] }] }),
    ).rejects.toThrow('There is no field "nickname" for section "about"');
  });

  it('is for those who may change the schema', async () => {
    await expect(cms.schema.define(editor, agents)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('building a content type by hand', () => {
  it('changes what a type is called and where its entries live, and nothing else', async () => {
    const changed = await cms.schema.update(owner, listings.id, { label: { en: 'Homes' }, urlPattern: '/homes/[slug]' });
    expect(changed).toMatchObject({ key: 'listings', label: { en: 'Homes' }, urlPattern: '/homes/[slug]' });
    expect(changed.fields).toEqual(listings.fields);
    expect(await cms.schema.update(owner, listings.id, { urlPattern: null })).not.toHaveProperty('urlPattern');
    await expect(cms.schema.update(owner, listings.id, { label: { en: '  ' } })).rejects.toThrow('Give the content type a name.');
    await expect(cms.schema.update(owner, listings.id, { urlPattern: 'https://elsewhere.test/[slug]' })).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.schema.update(editor, listings.id, { label: { en: 'Homes' } })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a second type with a key that is taken', async () => {
    await expect(cms.schema.create(owner, { key: 'listings', kind: 'collection', label: { en: 'Again' } })).rejects.toThrow('already a content type with the key "listings"');
  });

  it('changes a field in place: its id and content stay, its settings are checked', async () => {
    const headline = id(listings, 'headline');
    const entry = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'farmhouse', data: { [headline]: 'Restored farmhouse' } });
    const changed = await cms.schema.changeField(owner, listings.id, headline, {
      key: 'title',
      label: { en: 'Title' },
      help: { en: 'Shown at the top of the page.' },
      required: false,
      translated: false,
      options: { maxLength: 120 },
    });
    expect(changed.fields[0]).toEqual({
      id: headline,
      key: 'title',
      type: 'text',
      label: { en: 'Title' },
      help: { en: 'Shown at the top of the page.' },
      translated: false,
      required: false,
      options: { maxLength: 120 },
    });
    expect(cms.content.toPublic(changed, entry, 'working').data).toMatchObject({ title: 'Restored farmhouse' });
    expect((await cms.schema.changeField(owner, listings.id, headline, { help: null })).fields[0]).not.toHaveProperty('help');

    await expect(cms.schema.changeField(owner, listings.id, headline, { options: { maxLength: -1 } })).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.schema.changeField(owner, listings.id, headline, { key: 'price' })).rejects.toBeInstanceOf(ConflictError);
    await expect(cms.schema.changeField(owner, listings.id, headline, { label: {} })).rejects.toThrow('Give the field a name.');
    await cms.schema.removeField(owner, listings.id, headline);
    await expect(cms.schema.changeField(owner, listings.id, headline, { required: true })).rejects.toThrow('Restore it before changing it.');
  });

  it('puts fields in order, keeping removed ones, and refuses an order that leaves a field out', async () => {
    const [headline, price, status, photos] = listings.fields.map((field) => field.id) as [string, string, string, string];
    await cms.schema.removeField(owner, listings.id, status);
    const arranged = await cms.schema.arrangeFields(owner, listings.id, { order: [photos, headline, price] });
    expect(arranged.fields.map((field) => field.key)).toEqual(['photos', 'headline', 'price', 'status']);
    await expect(cms.schema.arrangeFields(owner, listings.id, { order: [photos, headline] })).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.schema.arrangeFields(owner, listings.id, { order: [photos, headline, headline] })).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.schema.arrangeFields(owner, listings.id, { order: [photos, headline, status] })).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.schema.arrangeFields(editor, listings.id, { order: [photos, headline, price] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('says which section shows which field, and adds a new field to a section', async () => {
    const type = await cms.schema.define(owner, {
      key: 'agents',
      kind: 'collection',
      label: { en: 'Agents' },
      fields: [
        { key: 'name', type: 'text', label: { en: 'Name' } },
        { key: 'bio', type: 'text', label: { en: 'Bio' } },
      ],
      sections: [
        { key: 'about', label: { en: 'About' }, fields: ['name', 'bio'] },
        { key: 'contact', label: { en: 'Contact' }, fields: [], aside: true },
      ],
    });
    const [name, bio] = type.fields.map((field) => field.id) as [string, string];
    const withPhone = await cms.schema.addField(owner, type.id, { key: 'phone', type: 'text', label: { en: 'Phone' } }, { section: 'contact' });
    const phone = id(withPhone, 'phone');
    expect(withPhone.sections?.[1]).toMatchObject({ key: 'contact', fieldIds: [phone], aside: true });

    const arranged = await cms.schema.arrangeFields(owner, type.id, { order: [bio, name, phone], sections: { about: [bio], contact: [phone, name] } });
    expect(arranged.sections?.map((section) => section.fieldIds)).toEqual([[bio], [phone, name]]);
    expect(arranged.sections?.[0]?.label).toEqual({ en: 'About' });

    await expect(cms.schema.addField(owner, type.id, { key: 'email', type: 'text', label: { en: 'Email' } }, { section: 'nowhere' })).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.schema.arrangeFields(owner, type.id, { order: [bio, name, phone], sections: { about: [bio], contact: [bio] } })).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.schema.arrangeFields(owner, type.id, { order: [bio, name, phone], sections: { nowhere: [bio] } })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('building what a group holds, and a type\'s sections and lists', () => {
  let agents: ContentTypeDef;
  const inner = (type: ContentTypeDef, key: string) => type.fields.find((field) => field.key === key)?.options as { fields?: FieldDef[]; of?: { options: { fields: FieldDef[] } } };

  beforeEach(async () => {
    agents = await cms.schema.define(owner, {
      key: 'agents',
      kind: 'collection',
      label: { en: 'Agents' },
      fields: [
        { key: 'name', type: 'text', label: { en: 'Name' } },
        { key: 'phone', type: 'group', label: { en: 'Phone' }, options: { fields: [{ key: 'display', type: 'text', label: { en: 'Number' } }] } },
        { key: 'offices', type: 'list', label: { en: 'Offices' }, options: { of: { type: 'group', options: { fields: [{ key: 'city', type: 'text', label: { en: 'City' } }] } } } },
        { key: 'photo', type: 'image', label: { en: 'Photo' } },
      ],
    });
  });

  it('adds, changes, orders, removes and restores a field inside a group, keeping ids and content', async () => {
    const phone = id(agents, 'phone');
    const display = inner(agents, 'phone').fields?.[0]?.id as string;
    const entry = await cms.content.create(editor, { typeId: agents.id, locale: 'en', slug: 'maya', data: { [phone]: { [display]: '555 0100' } } });

    const added = await cms.schema.addField(owner, agents.id, { key: 'href', type: 'url', label: { en: 'Link' } }, { within: [phone] });
    const href = inner(added, 'phone').fields?.[1]?.id as string;
    expect(inner(added, 'phone').fields?.map((field) => field.key)).toEqual(['display', 'href']);
    await expect(cms.schema.addField(owner, agents.id, { key: 'display', type: 'text', label: { en: 'Again' } }, { within: [phone] })).rejects.toBeInstanceOf(ConflictError);

    const changed = await cms.schema.changeField(owner, agents.id, display, { key: 'number', required: true }, [phone]);
    expect(inner(changed, 'phone').fields?.[0]).toMatchObject({ id: display, key: 'number', required: true });
    expect(cms.content.toPublic(changed, entry, 'working').data).toMatchObject({ phone: { number: '555 0100' } });

    const ordered = await cms.schema.arrangeFields(owner, agents.id, { order: [href, display], within: [phone] });
    expect(inner(ordered, 'phone').fields?.map((field) => field.key)).toEqual(['href', 'number']);
    await expect(cms.schema.arrangeFields(owner, agents.id, { order: [href], within: [phone] })).rejects.toBeInstanceOf(ValidationError);

    const removed = await cms.schema.removeField(owner, agents.id, href, [phone]);
    expect(inner(removed, 'phone').fields?.[0]?.deletedAt).toBeTypeOf('string');
    // Changing the group itself sends its settings back whole, and must not bring the field back.
    const renamed = await cms.schema.changeField(owner, agents.id, phone, { label: { en: 'Telephone' }, options: removed.fields[1]?.options ?? {} });
    expect(inner(renamed, 'phone').fields?.find((field) => field.id === href)?.deletedAt).toBeTypeOf('string');
    const restored = await cms.schema.restoreField(owner, agents.id, href, [phone]);
    expect(inner(restored, 'phone').fields?.every((field) => field.deletedAt === undefined)).toBe(true);
  });

  it('reaches the fields of a list of groups the same way, and refuses a field that holds none', async () => {
    const offices = id(agents, 'offices');
    const added = await cms.schema.addField(owner, agents.id, { key: 'street', type: 'text', label: { en: 'Street' } }, { within: [offices] });
    expect(inner(added, 'offices').of?.options.fields.map((field) => field.key)).toEqual(['city', 'street']);
    await expect(cms.schema.addField(owner, agents.id, { key: 'x', type: 'text', label: { en: 'X' } }, { within: [id(agents, 'name')] })).rejects.toThrow('does not hold other fields');
    await expect(cms.schema.addField(owner, agents.id, { key: 'x', type: 'text', label: { en: 'X' } }, { within: ['nothing'] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(cms.schema.addField(editor, agents.id, { key: 'x', type: 'text', label: { en: 'X' } }, { within: [offices] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('sets the sections the editor shows, and removes them without removing a field', async () => {
    const [name, phone, offices, photo] = agents.fields.map((field) => field.id) as [string, string, string, string];
    const set = await cms.schema.setSections(owner, agents.id, [
      { key: 'about', label: { en: 'About' }, fieldIds: [name, photo] },
      { key: 'contact', label: { en: 'Contact' }, fieldIds: [phone], aside: true },
    ]);
    expect(set.sections).toEqual([
      { key: 'about', label: { en: 'About' }, fieldIds: [name, photo] },
      { key: 'contact', label: { en: 'Contact' }, fieldIds: [phone], aside: true },
    ]);
    await expect(cms.schema.setSections(owner, agents.id, [{ key: 'a', label: { en: 'A' }, fieldIds: [name] }, { key: 'a', label: { en: 'B' }, fieldIds: [] }])).rejects.toBeInstanceOf(ConflictError);
    await expect(cms.schema.setSections(owner, agents.id, [{ key: 'a', label: { en: 'A' }, fieldIds: [name] }, { key: 'b', label: { en: 'B' }, fieldIds: [name] }])).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.schema.setSections(owner, agents.id, [{ key: 'a', label: { en: '' }, fieldIds: [] }])).rejects.toThrow('Give the section a name.');
    await expect(cms.schema.setSections(owner, agents.id, [{ key: 'Not A Key', label: { en: 'A' }, fieldIds: [] }])).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.schema.setSections(editor, agents.id, [])).rejects.toBeInstanceOf(ForbiddenError);

    const none = await cms.schema.setSections(owner, agents.id, []);
    expect(none).not.toHaveProperty('sections');
    expect(none.fields.map((field) => field.id)).toEqual([name, phone, offices, photo]);
  });

  it('chooses what entries are called by and what a list shows, by field id', async () => {
    const [name, phone, , photo] = agents.fields.map((field) => field.id) as [string, string, string, string];
    const display = inner(agents, 'phone').fields?.[0]?.id as string;
    const chosen = await cms.schema.update(owner, agents.id, { titlePath: [name], list: { imagePath: [photo], fieldPaths: [[phone, display]] } });
    expect(chosen).toMatchObject({ titlePath: [name], list: { imagePath: [photo], fieldPaths: [[phone, display]] } });
    // What is not named stays as it was.
    expect(await cms.schema.update(owner, agents.id, { label: { en: 'Team' } })).toMatchObject({ titlePath: [name], list: { imagePath: [photo] } });
    const cleared = await cms.schema.update(owner, agents.id, { titlePath: null, list: null });
    expect(cleared).not.toHaveProperty('titlePath');
    expect(cleared).not.toHaveProperty('list');
    await expect(cms.schema.update(owner, agents.id, { titlePath: ['nothing'] })).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.schema.update(owner, agents.id, { list: { fieldPaths: [[name, display]] } })).rejects.toBeInstanceOf(ValidationError);
  });
});
