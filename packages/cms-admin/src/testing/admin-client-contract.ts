import type { ContentTypeDef, Entry } from '@velocity/cms-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminClient } from '../client/admin-client.js';
import { sampleContentTypes, sampleEntries } from './sample-content.js';

export interface AdminClientSeed {
  readonly contentTypes: readonly ContentTypeDef[];
  readonly entries: readonly Entry[];
}

/**
 * What the screens rely on from any `AdminClient`. The in-memory client and the HTTP client both
 * run it, so a screen that passes its tests against one behaves the same against the other.
 *
 * @param make Builds a client, signed in, holding the content it is given.
 */
export function adminClientContract(name: string, make: (seed: AdminClientSeed) => Promise<AdminClient>): void {
  describe(`${name} (AdminClient contract)`, () => {
    let client: AdminClient;

    beforeEach(async () => {
      client = await make({ contentTypes: sampleContentTypes, entries: sampleEntries(new Date('2026-11-17T12:00:00.000Z')) });
    });

    it('lists content types by key, and the control for each field type', async () => {
      expect((await client.listContentTypes()).map((type) => type.key)).toEqual(['agents', 'listings']);
      expect(await client.listFieldTypes()).toContainEqual({ type: 'number', editor: 'number-input' });
    });

    it('lists entries most recently saved first, a page at a time', async () => {
      const all = await client.listEntries({ type: 'listings' });
      expect(all.items.map((entry) => entry.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
      expect(all.total).toBe(4);
      const page = await client.listEntries({ type: 'listings', limit: 2, offset: 1 });
      expect(page.items.map((entry) => entry.id)).toEqual(['e2', 'e3']);
      expect(page.total).toBe(4);
      expect((await client.listEntries({ type: 'listings', locale: 'es' })).total).toBe(0);
    });

    it('rejects with a code the screens can act on', async () => {
      await expect(client.getEntry('nope')).rejects.toMatchObject({ name: 'AdminRequestError', code: 'not_found' });
      await expect(client.listEntries({ type: 'unicorns' })).rejects.toMatchObject({ code: 'not_found' });
    });

    it('creates a draft in the default language, then saves changes to it', async () => {
      const created = await client.createEntry({ type: 'agents', slug: 'maria-ortiz', data: { 'f-name': 'María Ortiz' } });
      expect(created).toMatchObject({ locale: 'en', status: 'draft', revision: 1, slug: 'maria-ortiz' });
      const saved = await client.updateEntry(created.id, { slug: 'maria', data: { 'f-name': 'María' }, expectedRevision: 1 });
      expect(saved).toMatchObject({ revision: 2, slug: 'maria', data: { 'f-name': 'María' } });
      expect(await client.getEntry(created.id)).toEqual(saved);
    });

    it('refuses a save made from a revision that has been replaced', async () => {
      const entry = await client.getEntry('e2');
      const changes = { slug: entry.slug, data: entry.data, expectedRevision: entry.revision };
      await client.updateEntry('e2', changes);
      await expect(client.updateEntry('e2', changes)).rejects.toMatchObject({ code: 'conflict' });
    });

    it('names each field that stops a publish, by key', async () => {
      const refused = client.publishEntry('e4', 1);
      await expect(refused).rejects.toMatchObject({
        code: 'validation_failed',
        issues: [{ path: ['title'], message: 'Fill this in before publishing.' }],
      });
    });

    it('reports a slug that cannot be used at the path the form shows it under', async () => {
      await expect(client.createEntry({ type: 'agents', slug: 'Not A Slug', data: {} })).rejects.toMatchObject({
        code: 'validation_failed',
        issues: [{ path: ['$slug'] }],
      });
    });

    it('publishes and unpublishes', async () => {
      const published = await client.publishEntry('e2', 1);
      expect(published).toMatchObject({ status: 'published', published: { slug: '18-alder-court' } });
      const draft = await client.unpublishEntry('e2');
      expect(draft.status).toBe('draft');
      expect(draft).not.toHaveProperty('published');
    });
  });
}
