import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Actor } from './access.js';
import { createCms, type Cms } from './cms.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import { FieldType } from './field-type.js';
import { hasUnpublishedChanges, type ContentTypeDef, type FieldDef } from './model.js';
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
    await expect(cms.content.publish(editor, draft.id)).rejects.toMatchObject({
      issues: [{ path: ['price'] }],
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

  it('has nothing for visitors before the first publish or after an unpublish', async () => {
    const draft = await cms.content.create(editor, { typeId: listings.id, locale: 'en', slug: 'a', data: valid() });
    expect(() => cms.content.toPublic(listings, draft)).toThrow(NotFoundError);
    const live = await cms.content.publish(editor, draft.id);
    const withdrawn = await cms.content.unpublish(editor, live.id);
    expect(withdrawn).not.toHaveProperty('published');
    expect(() => cms.content.toPublic(listings, withdrawn)).toThrow(NotFoundError);
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
