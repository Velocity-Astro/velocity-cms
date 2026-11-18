import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import type { Contact, ContactNote, ContentTypeDef, Entry, FormDef, MediaFile, Submission } from '../model.js';
import type { ContactRepository, EntryRepository, FormRepository, SubmissionRepository, MediaRepository, MediaStore, PluginStore, SchemaRepository, SearchDocument, SearchIndex } from '../ports.js';

/**
 * The contract tests for storage adapters.
 *
 * An adapter is finished when it passes these. Call each from the adapter's own test file with a
 * function that returns a fresh, empty repository:
 *
 * ```ts
 * entryRepositoryContract('PostgresEntryRepository', async () => new PostgresEntryRepository(db));
 * ```
 */

const entry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  typeId: 't1',
  locale: 'en',
  translationGroup: 'e1',
  slug: 'first',
  status: 'draft',
  data: { f1: 'Hello', f2: { nested: [1, 2, 3] } },
  revision: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const fresh = { expectedRevision: null, actorId: 'tester' } as const;

export function entryRepositoryContract(name: string, create: () => Promise<EntryRepository>): void {
  describe(`${name}: EntryRepository contract`, () => {
    let repository: EntryRepository;
    beforeEach(async () => {
      repository = await create();
    });

    it('returns null for an entry that does not exist', async () => {
      expect(await repository.get('missing')).toBeNull();
    });

    it('stores an entry and returns it unchanged, nested data included', async () => {
      await repository.save(entry(), fresh);
      expect(await repository.get('e1')).toEqual(entry());
    });

    it('keeps optional fields off the entry when they were not set', async () => {
      await repository.save(entry(), fresh);
      expect(await repository.get('e1')).not.toHaveProperty('publishAt');
    });

    it('stores and returns publishAt', async () => {
      const scheduled = entry({ status: 'scheduled', publishAt: '2026-02-01T09:00:00.000Z' });
      await repository.save(scheduled, fresh);
      expect(await repository.get('e1')).toEqual(scheduled);
    });

    it('replaces an entry when the expected revision matches', async () => {
      await repository.save(entry(), fresh);
      const next = entry({ revision: 2, data: { f1: 'Changed' }, updatedAt: '2026-01-02T00:00:00.000Z' });
      await repository.save(next, { expectedRevision: 1, actorId: 'tester' });
      expect(await repository.get('e1')).toEqual(next);
    });

    it('refuses a save when the stored entry has moved on', async () => {
      await repository.save(entry(), fresh);
      await repository.save(entry({ revision: 2 }), { expectedRevision: 1, actorId: 'a' });
      await expect(
        repository.save(entry({ revision: 2, data: { f1: 'Late' } }), { expectedRevision: 1, actorId: 'b' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('refuses to create an entry that already exists', async () => {
      await repository.save(entry(), fresh);
      await expect(repository.save(entry(), fresh)).rejects.toBeInstanceOf(ConflictError);
    });

    it('refuses a slug already used by the same type and locale', async () => {
      await repository.save(entry(), fresh);
      await expect(repository.save(entry({ id: 'e2', translationGroup: 'e2' }), fresh)).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('allows the same slug in another locale or another type', async () => {
      await repository.save(entry(), fresh);
      await repository.save(entry({ id: 'e2', locale: 'es' }), fresh);
      await repository.save(entry({ id: 'e3', typeId: 't2' }), fresh);
      expect((await repository.find()).total).toBe(3);
    });

    const live = { slug: 'first', data: { f1: 'Live' }, revision: 2, at: '2026-01-02T00:00:00.000Z' };

    it('stores the published version beside the working one, and drops it on unpublish', async () => {
      await repository.save(entry(), fresh);
      const published = entry({ revision: 2, status: 'published', published: live });
      await repository.save(published, { expectedRevision: 1, actorId: 'tester' });
      expect(await repository.get('e1')).toEqual(published);

      const edited = entry({ revision: 3, status: 'published', slug: 'renamed', data: { f1: 'Draft' }, published: live });
      await repository.save(edited, { expectedRevision: 2, actorId: 'tester' });
      expect(await repository.get('e1')).toEqual(edited);

      await repository.save(entry({ revision: 4, slug: 'renamed' }), { expectedRevision: 3, actorId: 'tester' });
      expect(await repository.get('e1')).not.toHaveProperty('published');
    });

    it('finds an entry by its working slug or by the slug visitors see', async () => {
      await repository.save(entry({ status: 'published', slug: 'renamed', published: live }), fresh);
      await repository.save(entry({ id: 'e2', slug: 'second' }), fresh);
      const ids = async (query: Parameters<EntryRepository['find']>[0]) => (await repository.find(query)).items.map((item) => item.id);
      expect(await ids({ slug: 'renamed' })).toEqual(['e1']);
      expect(await ids({ slug: 'first' })).toEqual([]);
      expect(await ids({ publishedSlug: 'first' })).toEqual(['e1']);
      expect(await ids({ publishedSlug: 'second' })).toEqual([]);
      expect(await ids({ typeId: 't1', locale: 'en', slug: 'second' })).toEqual(['e2']);
    });

    it('refuses a slug that another entry still shows to visitors', async () => {
      await repository.save(entry({ status: 'published', slug: 'renamed', published: live }), fresh);
      await expect(repository.save(entry({ id: 'e2', slug: 'first' }), fresh)).rejects.toBeInstanceOf(ConflictError);
      await expect(
        repository.save(entry({ id: 'e3', slug: 'third', status: 'published', published: { ...live, slug: 'renamed' } }), fresh),
      ).rejects.toBeInstanceOf(ConflictError);
      await repository.save(entry({ id: 'e4', slug: 'first', locale: 'es' }), fresh);
    });

    it('keeps an entry in the trash out of every search but the one for the trash', async () => {
      const gone = entry({ id: 'e2', slug: 'second', revision: 2, deletedAt: '2026-01-03T00:00:00.000Z' });
      await repository.save(entry(), fresh);
      await repository.save(entry({ id: 'e2', slug: 'second' }), fresh);
      await repository.save(gone, { expectedRevision: 1, actorId: 'tester' });
      expect(await repository.get('e2')).toEqual(gone);
      expect(await repository.get('e1')).not.toHaveProperty('deletedAt');
      const found = async (query: Parameters<EntryRepository['find']>[0]) => {
        const page = await repository.find(query);
        return [page.items.map((item) => item.id), page.total];
      };
      expect(await found({})).toEqual([['e1'], 1]);
      expect(await found({ slug: 'second' })).toEqual([[], 0]);
      expect(await found({ trashed: false })).toEqual([['e1'], 1]);
      expect(await found({ trashed: true })).toEqual([['e2'], 1]);
      expect(await found({ trashed: true, slug: 'first' })).toEqual([[], 0]);
    });

    it('frees the slug of an entry in the trash, and lets two in the trash share one', async () => {
      const at = '2026-01-03T00:00:00.000Z';
      await repository.save(entry(), fresh);
      await repository.save(entry({ revision: 2, deletedAt: at }), { expectedRevision: 1, actorId: 'tester' });
      await repository.save(entry({ id: 'e2' }), fresh);
      await repository.save(entry({ id: 'e2', revision: 2, deletedAt: at }), { expectedRevision: 1, actorId: 'tester' });
      await repository.save(entry({ id: 'e3' }), fresh);
      // Coming back, an entry needs its slug like any other.
      await expect(repository.save(entry({ revision: 3 }), { expectedRevision: 2, actorId: 'tester' })).rejects.toBeInstanceOf(ConflictError);
    });

    it('removes an entry and its history, and ignores an id nothing has', async () => {
      await repository.save(entry(), fresh);
      await repository.save(entry({ id: 'e2', slug: 'second' }), fresh);
      await repository.remove('e1');
      await repository.remove('nobody');
      expect(await repository.get('e1')).toBeNull();
      expect(await repository.history('e1')).toEqual([]);
      expect(await repository.history('e2')).toHaveLength(1);
      // Nothing of it is left to refuse a new entry under the same id.
      await repository.save(entry(), fresh);
    });

    it('keeps every saved version in history, newest first', async () => {
      await repository.save(entry(), { expectedRevision: null, actorId: 'ana' });
      await repository.save(entry({ revision: 2, status: 'published', data: { f1: 'Second' } }), {
        expectedRevision: 1,
        actorId: 'ben',
      });
      const history = await repository.history('e1');
      expect(history.map((revision) => [revision.revision, revision.status, revision.actorId])).toEqual([
        [2, 'published', 'ben'],
        [1, 'draft', 'ana'],
      ]);
      expect(history[1]?.data).toEqual(entry().data);
    });

    it('filters by type, locale and status', async () => {
      await repository.save(entry(), fresh);
      await repository.save(entry({ id: 'e2', slug: 'second', status: 'published' }), fresh);
      await repository.save(entry({ id: 'e3', locale: 'es', status: 'published' }), fresh);
      await repository.save(entry({ id: 'e4', typeId: 't2', status: 'published' }), fresh);

      const found = await repository.find({ typeId: 't1', locale: 'en', status: 'published' });
      expect(found.items.map((item) => item.id)).toEqual(['e2']);
      expect(found.total).toBe(1);
    });

    it('pages through results in a stable order and reports the full total', async () => {
      for (let index = 1; index <= 5; index++) {
        await repository.save(
          entry({ id: `e${index}`, slug: `s${index}`, createdAt: `2026-01-0${index}T00:00:00.000Z` }),
          fresh,
        );
      }
      const page = await repository.find({ limit: 2, offset: 2 });
      expect(page.items.map((item) => item.id)).toEqual(['e3', 'e4']);
      expect(page.total).toBe(5);
    });

    it('lists the most recently saved first when asked', async () => {
      const at = (day: number) => `2026-02-0${day}T00:00:00.000Z`;
      await repository.save(entry({ id: 'e1', slug: 's1', createdAt: at(1), updatedAt: at(5) }), fresh);
      await repository.save(entry({ id: 'e2', slug: 's2', createdAt: at(2), updatedAt: at(9) }), fresh);
      await repository.save(entry({ id: 'e3', slug: 's3', createdAt: at(3), updatedAt: at(3) }), fresh);
      const ids = async (query: Parameters<EntryRepository['find']>[0]) => (await repository.find(query)).items.map((item) => item.id);
      expect(await ids({ order: 'updated' })).toEqual(['e2', 'e1', 'e3']);
      expect(await ids({ order: 'updated', limit: 1, offset: 1 })).toEqual(['e1']);
      expect(await ids({ order: 'created' })).toEqual(['e1', 'e2', 'e3']);
    });
  });
}

const type = (overrides: Partial<ContentTypeDef> = {}): ContentTypeDef => ({
  id: 't1',
  key: 'listings',
  kind: 'collection',
  label: { en: 'Listings', es: 'Propiedades' },
  urlPattern: '/listings/[slug]',
  fields: [
    {
      id: 'f1',
      key: 'headline',
      type: 'text',
      label: { en: 'Headline' },
      translated: true,
      required: true,
      options: { maxLength: 120 },
    },
  ],
  ...overrides,
});

export function schemaRepositoryContract(name: string, create: () => Promise<SchemaRepository>): void {
  describe(`${name}: SchemaRepository contract`, () => {
    let repository: SchemaRepository;
    beforeEach(async () => {
      repository = await create();
    });

    it('returns null for a type that does not exist', async () => {
      expect(await repository.get('missing')).toBeNull();
      expect(await repository.getByKey('missing')).toBeNull();
    });

    it('stores a type and finds it by id and by key', async () => {
      await repository.save(type());
      expect(await repository.get('t1')).toEqual(type());
      expect(await repository.getByKey('listings')).toEqual(type());
    });

    it('replaces a type saved again under the same id', async () => {
      await repository.save(type());
      const renamed = type({ key: 'homes', fields: [] });
      await repository.save(renamed);
      expect(await repository.get('t1')).toEqual(renamed);
      expect(await repository.getByKey('listings')).toBeNull();
    });

    it('refuses a key another type already uses', async () => {
      await repository.save(type());
      await expect(repository.save(type({ id: 't2' }))).rejects.toBeInstanceOf(ConflictError);
    });

    it('lists types ordered by key', async () => {
      await repository.save(type());
      await repository.save(type({ id: 't2', key: 'agents' }));
      expect((await repository.list()).map((item) => item.key)).toEqual(['agents', 'listings']);
    });
  });
}

const page = (overrides: Partial<SearchDocument> = {}): SearchDocument => ({
  id: 'en:/listings/lake-house/',
  locale: 'en',
  url: '/listings/lake-house/',
  title: 'Lake House',
  body: 'Four bedrooms on Quillfeather Lane, with a pergola & a <garden> by the water.',
  ...overrides,
});

export function searchIndexContract(name: string, create: () => Promise<SearchIndex>): void {
  describe(`${name}: SearchIndex contract`, () => {
    let index: SearchIndex;
    beforeEach(async () => {
      index = await create();
      await index.put([
        page(),
        page({ id: 'es:/es/propiedades/casa-del-lago/', locale: 'es', url: '/es/propiedades/casa-del-lago/', title: 'Casa del Lago', body: 'Cuatro habitaciones y un jardín junto al agua.' }),
        page({ id: 'en:/agents/', url: '/agents/', title: 'Our agents', body: 'Maya sold the lake house on Quillfeather Lane.' }),
      ]);
    });

    it('finds a document by a word in its body, and says how many match', async () => {
      const results = await index.search({ text: 'pergola' });
      expect(results.total).toBe(1);
      expect(results.hits.map((hit) => hit.url)).toEqual(['/listings/lake-house/']);
      expect(results.hits[0]?.title).toBe('Lake House');
    });

    it('needs every word, in any order and any case', async () => {
      expect((await index.search({ text: 'LANE quillfeather' })).total).toBe(2);
      expect((await index.search({ text: 'quillfeather pergola' })).total).toBe(1);
      expect((await index.search({ text: 'quillfeather zebra' })).total).toBe(0);
    });

    it('puts a match in the title before a match in the body', async () => {
      const results = await index.search({ text: 'lake house' });
      expect(results.hits.map((hit) => hit.url)).toEqual(['/listings/lake-house/', '/agents/']);
    });

    it('matches the last word as a beginning, for search as you type', async () => {
      expect((await index.search({ text: 'quillf' })).total).toBe(2);
      expect((await index.search({ text: 'quillf lane' })).total).toBe(0);
    });

    it('ignores accents', async () => {
      expect((await index.search({ text: 'jardin' })).hits.map((hit) => hit.title)).toEqual(['Casa del Lago']);
    });

    it('keeps to one language when asked', async () => {
      expect((await index.search({ text: 'agua' })).total).toBe(1);
      expect((await index.search({ text: 'agua', locale: 'en' })).total).toBe(0);
      expect((await index.search({ text: 'water', locale: 'en' })).total).toBe(1);
    });

    it('returns an excerpt that is safe to show, with the match marked', async () => {
      const [hit] = (await index.search({ text: 'pergola' })).hits;
      expect(hit?.excerpt).toContain('<mark>pergola</mark>');
      expect(hit?.excerpt).toContain('&amp;');
      expect(hit?.excerpt).toContain('&lt;garden&gt;');
    });

    it('accepts any text a visitor might type', async () => {
      for (const text of ['', '   ', '"', 'a AND (b', "o'brien NEAR *", 'title:lake', '-', '^lake"']) {
        await expect(index.search({ text })).resolves.toBeDefined();
      }
      expect((await index.search({ text: '' })).total).toBe(0);
    });

    it('limits the hits but not the total', async () => {
      const results = await index.search({ text: 'quillfeather', limit: 1 });
      expect(results.hits).toHaveLength(1);
      expect(results.total).toBe(2);
    });

    it('replaces a document that is put again', async () => {
      await index.put([page({ body: 'Now on Zebra Street.' })]);
      expect(await index.count()).toBe(3);
      expect((await index.search({ text: 'zebra' })).total).toBe(1);
      expect((await index.search({ text: 'pergola' })).total).toBe(0);
    });

    it('removes documents, and ignores ids it does not have', async () => {
      await index.remove(['en:/agents/', 'nothing']);
      expect(await index.count()).toBe(2);
      expect((await index.search({ text: 'maya' })).total).toBe(0);
    });
  });
}

const mediaFile = (overrides: Partial<MediaFile> = {}): MediaFile => ({
  name: 'kitchen',
  key: 'kitchen.jpg',
  contentType: 'image/jpeg',
  width: 1600,
  height: 1200,
  size: 204_800,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'u1',
  ...overrides,
});

export function mediaRepositoryContract(name: string, create: () => Promise<MediaRepository>): void {
  describe(`${name}: MediaRepository contract`, () => {
    let files: MediaRepository;
    beforeEach(async () => {
      files = await create();
    });

    it('gives back a record exactly as it was added', async () => {
      await files.add(mediaFile());
      expect(await files.get('kitchen')).toEqual(mediaFile());
    });

    it('answers null for a name nothing has', async () => {
      expect(await files.get('missing')).toBeNull();
    });

    it('lists records ordered by name', async () => {
      await files.add(mediaFile({ name: 'porch', key: 'porch.png' }));
      await files.add(mediaFile());
      expect((await files.list()).map((file) => file.name)).toEqual(['kitchen', 'porch']);
    });

    it('refuses a name another record has', async () => {
      await files.add(mediaFile());
      await expect(files.add(mediaFile({ key: 'kitchen.png' }))).rejects.toBeInstanceOf(ConflictError);
    });

    it('refuses a key another record has', async () => {
      await files.add(mediaFile());
      await expect(files.add(mediaFile({ name: 'other' }))).rejects.toBeInstanceOf(ConflictError);
    });

    it('removes a record, and ignores a name nothing has', async () => {
      await files.add(mediaFile());
      await files.remove('kitchen');
      await files.remove('kitchen');
      expect(await files.list()).toEqual([]);
    });
  });
}

export function mediaStoreContract(name: string, create: () => Promise<MediaStore>): void {
  describe(`${name}: MediaStore contract`, () => {
    let store: MediaStore;
    const bytes = Uint8Array.from([0, 255, 1, 254, 13, 10, 0]);
    beforeEach(async () => {
      store = await create();
    });

    it('gives back the same bytes and content type', async () => {
      await store.put('kitchen.jpg', { bytes, contentType: 'image/jpeg' });
      const file = await store.get('kitchen.jpg');
      expect(file?.contentType).toBe('image/jpeg');
      expect([...(file?.bytes ?? [])]).toEqual([...bytes]);
    });

    it('answers null for a key nothing is kept under', async () => {
      expect(await store.get('missing.jpg')).toBeNull();
    });

    it('answers null for a key that reaches outside the store', async () => {
      expect(await store.get('../kitchen.jpg')).toBeNull();
      expect(await store.get('a/b.jpg')).toBeNull();
    });

    it('removes a file, and ignores a key nothing is kept under', async () => {
      await store.put('kitchen.jpg', { bytes, contentType: 'image/jpeg' });
      await store.remove('kitchen.jpg');
      await store.remove('kitchen.jpg');
      expect(await store.get('kitchen.jpg')).toBeNull();
    });
  });
}

export function pluginStoreContract(name: string, create: () => Promise<PluginStore>): void {
  describe(`${name}: PluginStore contract`, () => {
    let store: PluginStore;
    beforeEach(async () => {
      store = await create();
    });

    it('gives back a value exactly as it was set, and undefined for a key nothing is under', async () => {
      await store.set('seo', 'settings', { titleSuffix: ' | Lakeshore', nested: [1, 'two', { three: true }] });
      expect(await store.get('seo', 'settings')).toEqual({ titleSuffix: ' | Lakeshore', nested: [1, 'two', { three: true }] });
      expect(await store.get('seo', 'missing')).toBeUndefined();
    });

    it('keeps false, zero, null and an empty text as values, apart from nothing', async () => {
      for (const value of [false, 0, null, '']) {
        await store.set('seo', 'value', value);
        expect(await store.get('seo', 'value')).toBe(value);
      }
    });

    it('replaces a value set again', async () => {
      await store.set('seo', 'enabled', true);
      await store.set('seo', 'enabled', false);
      expect(await store.get('seo', 'enabled')).toBe(false);
    });

    it('keeps each plugin\'s values apart', async () => {
      await store.set('seo', 'count', 1);
      await store.set('forms', 'count', 2);
      expect(await store.get('seo', 'count')).toBe(1);
      expect(await store.get('forms', 'count')).toBe(2);
    });

    it('lists one plugin\'s values under a prefix, by key, and takes the prefix as it is written', async () => {
      await store.set('seo', 'meta:b', 2);
      await store.set('seo', 'meta:a', { title: 'A' });
      await store.set('seo', 'metaX', 'not under the prefix');
      await store.set('seo', 'm%ta:c', 'a sign that is not a wildcard');
      await store.set('forms', 'meta:a', 'another plugin');
      expect(await store.list('seo', 'meta:')).toEqual([['meta:a', { title: 'A' }], ['meta:b', 2]]);
      expect(await store.list('seo', 'm%')).toEqual([['m%ta:c', 'a sign that is not a wildcard']]);
      expect(await store.list('seo', 'nothing:')).toEqual([]);
    });

    it('removes a value, and ignores a key nothing is under', async () => {
      await store.set('seo', 'count', 1);
      await store.remove('seo', 'count');
      await store.remove('seo', 'count');
      expect(await store.get('seo', 'count')).toBeUndefined();
    });
  });
}

const form = (overrides: Partial<FormDef> = {}): FormDef => ({
  id: 'm1',
  key: 'contact',
  label: { en: 'Contact' },
  fields: [{ id: 'f1', key: 'email', type: 'email', label: { en: 'Email' }, translated: false, required: true, options: {} }],
  notify: ['office@example.com'],
  contact: { email: 'f1' },
  open: true,
  revision: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

export function formRepositoryContract(name: string, create: () => Promise<FormRepository>): void {
  describe(`${name}: FormRepository contract`, () => {
    let repository: FormRepository;
    beforeEach(async () => {
      repository = await create();
    });

    it('answers null for a form that does not exist', async () => {
      expect(await repository.get('nobody')).toBeNull();
      expect(await repository.getByKey('nobody')).toBeNull();
    });

    it('stores a form and gives it back unchanged, by id and by key', async () => {
      await repository.save(form(), null);
      expect(await repository.get('m1')).toEqual(form());
      expect(await repository.getByKey('contact')).toEqual(form());
      expect(await repository.get('m1')).not.toHaveProperty('deletedAt');
    });

    it('replaces a form when the expected revision matches, and refuses when it has moved on', async () => {
      await repository.save(form(), null);
      const next = form({ revision: 2, label: { en: 'Get in touch' }, open: false });
      await repository.save(next, 1);
      expect(await repository.get('m1')).toEqual(next);
      await expect(repository.save(form({ revision: 2 }), 1)).rejects.toBeInstanceOf(ConflictError);
      await expect(repository.save(form(), null)).rejects.toBeInstanceOf(ConflictError);
    });

    it('refuses a key another form uses, and lists forms by key', async () => {
      await repository.save(form(), null);
      await expect(repository.save(form({ id: 'm2' }), null)).rejects.toBeInstanceOf(ConflictError);
      await repository.save(form({ id: 'm2', key: 'apply' }), null);
      expect((await repository.list()).map((item) => item.key)).toEqual(['apply', 'contact']);
    });

    it('keeps a form in the trash out of the list and off its key, which another form may take', async () => {
      const gone = form({ revision: 2, deletedAt: '2026-01-02T00:00:00.000Z' });
      await repository.save(form(), null);
      await repository.save(gone, 1);
      expect(await repository.get('m1')).toEqual(gone);
      expect(await repository.getByKey('contact')).toBeNull();
      expect(await repository.list()).toEqual([]);
      expect(await repository.list({ trashed: true })).toEqual([gone]);
      await repository.save(form({ id: 'm2' }), null);
      // Coming back, it needs its key like any other.
      await expect(repository.save(form({ revision: 3 }), 2)).rejects.toBeInstanceOf(ConflictError);
    });

    it('removes a form, and ignores an id nothing has', async () => {
      await repository.save(form(), null);
      await repository.remove('m1');
      await repository.remove('m1');
      expect(await repository.get('m1')).toBeNull();
      await repository.save(form(), null);
    });
  });
}

const submission = (overrides: Partial<Submission> = {}): Submission => ({
  id: 's1',
  formId: 'm1',
  status: 'new',
  data: { f1: 'ana@example.com', f2: 3 },
  email: 'ana@example.com',
  createdAt: '2026-02-01T00:00:00.000Z',
  ...overrides,
});

export function submissionRepositoryContract(name: string, create: () => Promise<SubmissionRepository>): void {
  describe(`${name}: SubmissionRepository contract`, () => {
    let repository: SubmissionRepository;
    beforeEach(async () => {
      repository = await create();
    });
    const ids = async (query: Parameters<SubmissionRepository['find']>[0]) => (await repository.find(query)).items.map((item) => item.id);
    const at = (day: number) => `2026-02-0${day}T00:00:00.000Z`;

    it('answers null for a submission that does not exist', async () => {
      expect(await repository.get('nobody')).toBeNull();
    });

    it('gives back a submission exactly as it was added, with or without what is optional', async () => {
      const full = submission({ id: 's2', locale: 'es', page: '/es/contacto/', status: 'handled', handledAt: at(2), handledBy: 'u1' });
      const bare: Submission = { id: 's3', formId: 'm1', status: 'spam', data: {}, createdAt: at(1) };
      await repository.add(submission());
      await repository.add(full);
      await repository.add(bare);
      expect(await repository.get('s1')).toEqual(submission());
      expect(await repository.get('s2')).toEqual(full);
      expect(await repository.get('s3')).toEqual(bare);
      expect(Object.keys((await repository.get('s3')) ?? {}).sort()).toEqual(['createdAt', 'data', 'formId', 'id', 'status']);
    });

    it('refuses an id another submission has', async () => {
      await repository.add(submission());
      await expect(repository.add(submission({ data: {} }))).rejects.toBeInstanceOf(ConflictError);
    });

    it('lists the newest first, pages in a stable order and reports the full total', async () => {
      await repository.add(submission({ id: 's1', createdAt: at(1) }));
      await repository.add(submission({ id: 's3', createdAt: at(3) }));
      await repository.add(submission({ id: 's2b', createdAt: at(2) }));
      await repository.add(submission({ id: 's2a', createdAt: at(2) }));
      expect(await ids({})).toEqual(['s3', 's2a', 's2b', 's1']);
      const page = await repository.find({ limit: 2, offset: 1 });
      expect(page.items.map((item) => item.id)).toEqual(['s2a', 's2b']);
      expect(page.total).toBe(4);
    });

    it('filters by form, status, email and time', async () => {
      await repository.add(submission({ id: 's1', createdAt: at(1) }));
      await repository.add(submission({ id: 's2', createdAt: at(2), status: 'spam', email: 'bo@example.com' }));
      await repository.add(submission({ id: 's3', createdAt: at(3), formId: 'm2' }));
      const { email: _none, ...unnamed } = submission({ id: 's4', createdAt: at(4) });
      await repository.add(unnamed);
      expect(await ids({ formId: 'm1' })).toEqual(['s4', 's2', 's1']);
      expect(await ids({ formId: 'm1', status: 'new' })).toEqual(['s4', 's1']);
      expect(await ids({ email: 'ana@example.com' })).toEqual(['s3', 's1']);
      expect(await ids({ before: at(3) })).toEqual(['s2', 's1']);
      expect(await ids({ formId: 'm2', before: at(3) })).toEqual([]);
    });

    it('counts a form\'s submissions by status, with zero for a status it has none of', async () => {
      await repository.add(submission({ id: 's1' }));
      await repository.add(submission({ id: 's2' }));
      await repository.add(submission({ id: 's3', status: 'spam' }));
      await repository.add(submission({ id: 's4', formId: 'm2', status: 'handled' }));
      expect(await repository.counts('m1')).toEqual({ new: 2, handled: 0, spam: 1 });
      expect(await repository.counts('nobody')).toEqual({ new: 0, handled: 0, spam: 0 });
    });

    it('replaces a submission that exists, drops what is no longer set, and ignores one that does not exist', async () => {
      await repository.add(submission({ status: 'handled', handledAt: at(2), handledBy: 'u1' }));
      await repository.update(submission({ status: 'new' }));
      expect(await repository.get('s1')).toEqual(submission());
      await repository.update(submission({ id: 'nobody' }));
      expect(await repository.get('nobody')).toBeNull();
    });

    it('removes submissions by id or by form, and ignores what is not there', async () => {
      await repository.add(submission({ id: 's1' }));
      await repository.add(submission({ id: 's2' }));
      await repository.add(submission({ id: 's3' }));
      await repository.add(submission({ id: 's4', formId: 'm2' }));
      await repository.remove(['s1', 'nobody']);
      await repository.remove([]);
      expect(await ids({})).toEqual(['s2', 's3', 's4']);
      await repository.removeOfForm('m1');
      await repository.removeOfForm('nobody');
      expect(await ids({})).toEqual(['s4']);
    });
  });
}

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  email: 'ana@example.com',
  name: 'Ana Ruiz',
  phone: '512 555 0142',
  source: { formId: 'm1', page: '/contact/' },
  revision: 1,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  ...overrides,
});
const note = (overrides: Partial<ContactNote> = {}): ContactNote => ({ id: 'n1', contactId: 'c1', text: 'Called back.', createdBy: 'u1', createdAt: '2026-02-02T00:00:00.000Z', ...overrides });

/** Run this against every `ContactRepository` adapter. */
export function contactRepositoryContract(name: string, create: () => Promise<ContactRepository>): void {
  describe(`${name}: ContactRepository contract`, () => {
    let repository: ContactRepository;
    beforeEach(async () => {
      repository = await create();
    });
    const at = (day: number) => `2026-02-0${day}T00:00:00.000Z`;
    const ids = async (query: Parameters<ContactRepository['find']>[0]) => (await repository.find(query)).items.map((item) => item.id);

    it('answers null for a contact that does not exist', async () => {
      expect(await repository.get('nobody')).toBeNull();
      expect(await repository.getByEmail('nobody@example.com')).toBeNull();
    });

    it('gives back a contact exactly as it was saved, with or without what is optional, by id and by email', async () => {
      const bare: Contact = { id: 'c2', email: 'tom@example.com', revision: 1, createdAt: at(2), updatedAt: at(2) };
      const noPage = contact({ id: 'c3', email: 'li@example.com', source: { formId: 'm1' } });
      await repository.save(contact(), null);
      await repository.save(bare, null);
      await repository.save(noPage, null);
      expect(await repository.get('c1')).toEqual(contact());
      expect(await repository.getByEmail('ana@example.com')).toEqual(contact());
      expect(await repository.get('c2')).toEqual(bare);
      expect(Object.keys((await repository.get('c2')) ?? {}).sort()).toEqual(['createdAt', 'email', 'id', 'revision', 'updatedAt']);
      expect(await repository.get('c3')).toEqual(noPage);
    });

    it('refuses an email another contact has, a save from an old revision, and a change to one that is not there', async () => {
      await repository.save(contact(), null);
      await expect(repository.save(contact({ id: 'c2' }), null)).rejects.toBeInstanceOf(ConflictError);
      await expect(repository.save(contact({ revision: 2 }), null)).rejects.toBeInstanceOf(ConflictError);
      await expect(repository.save(contact({ id: 'c9', email: 'new@example.com', revision: 2 }), 1)).rejects.toBeInstanceOf(ConflictError);
      const saved = await repository.save(contact({ name: 'Ana R.', revision: 2 }), 1);
      expect(saved.name).toBe('Ana R.');
      await expect(repository.save(contact({ revision: 2 }), 1)).rejects.toBeInstanceOf(ConflictError);
      expect((await repository.get('c1'))?.name).toBe('Ana R.');
    });

    it('lists the newest first, pages in a stable order, reports the full total, and finds by name, email or phone', async () => {
      await repository.save(contact({ id: 'c1', createdAt: at(1) }), null);
      await repository.save(contact({ id: 'c3', email: 'tom@example.com', name: 'Tom Lee', phone: '512 555 0199', createdAt: at(3) }), null);
      await repository.save(contact({ id: 'c2b', email: 'li@elsewhere.test', name: 'Li', createdAt: at(2) }), null);
      await repository.save(contact({ id: 'c2a', email: 'sam@example.com', name: 'Sam', createdAt: at(2) }), null);
      expect(await ids({})).toEqual(['c3', 'c2a', 'c2b', 'c1']);
      const page = await repository.find({ limit: 2, offset: 1 });
      expect(page.items.map((item) => item.id)).toEqual(['c2a', 'c2b']);
      expect(page.total).toBe(4);
      expect(await ids({ search: 'RUIZ' })).toEqual(['c1']);
      expect(await ids({ search: 'elsewhere' })).toEqual(['c2b']);
      expect(await ids({ search: '0199' })).toEqual(['c3']);
      expect(await ids({ search: '100%' })).toEqual([]);
      expect((await repository.find({ search: 'example.com', limit: 1 })).total).toBe(3);
    });

    it('keeps notes newest first, each with its contact, and removes one only for its own contact', async () => {
      await repository.save(contact(), null);
      await repository.save(contact({ id: 'c2', email: 'tom@example.com' }), null);
      await repository.addNote(note());
      await repository.addNote(note({ id: 'n2', text: 'Wants a tour.', createdAt: at(3) }));
      await repository.addNote(note({ id: 'n3', contactId: 'c2' }));
      await expect(repository.addNote(note())).rejects.toBeInstanceOf(ConflictError);
      expect((await repository.notes('c1')).map((item) => item.id)).toEqual(['n2', 'n1']);
      expect(await repository.notes('c1')).toContainEqual(note());
      await repository.removeNote('c2', 'n1');
      expect(await repository.notes('c1')).toHaveLength(2);
      await repository.removeNote('c1', 'n1');
      await repository.removeNote('c1', 'nothing');
      expect((await repository.notes('c1')).map((item) => item.id)).toEqual(['n2']);
    });

    it('removes a contact with its notes, frees its email, and leaves the others', async () => {
      await repository.save(contact(), null);
      await repository.save(contact({ id: 'c2', email: 'tom@example.com' }), null);
      await repository.addNote(note());
      await repository.addNote(note({ id: 'n3', contactId: 'c2' }));
      await repository.remove('c1');
      await repository.remove('nobody');
      expect(await repository.get('c1')).toBeNull();
      expect(await repository.notes('c1')).toEqual([]);
      expect(await repository.notes('c2')).toHaveLength(1);
      await repository.save(contact({ id: 'c5' }), null);
      expect((await repository.getByEmail('ana@example.com'))?.id).toBe('c5');
    });
  });
}
