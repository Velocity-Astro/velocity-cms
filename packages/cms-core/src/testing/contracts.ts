import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import type { ContentTypeDef, Entry } from '../model.js';
import type { EntryRepository, SchemaRepository, SearchDocument, SearchIndex } from '../ports.js';

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
