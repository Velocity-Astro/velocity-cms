import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import type { ContentTypeDef, Entry } from '../model.js';
import type { EntryRepository, SchemaRepository } from '../ports.js';

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
