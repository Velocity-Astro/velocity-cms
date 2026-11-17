import type { ContentTypeDef, Entry } from '@velocity/cms-core';
import { expect, it } from 'vitest';
import { entryState, entryTitle, groupTranslations, languageName, localized, sameData, withValue } from './content.js';

const type: ContentTypeDef = {
  id: 't1',
  key: 'listings',
  kind: 'collection',
  label: { en: 'Listings' },
  fields: [
    { id: 'f0', key: 'old', type: 'text', label: { en: 'Old' }, translated: false, required: false, options: {}, deletedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'f1', key: 'price', type: 'number', label: { en: 'Price' }, translated: false, required: false, options: {} },
    { id: 'f2', key: 'title', type: 'text', label: { en: 'Title' }, translated: true, required: true, options: {} },
  ],
};
const entry = (changes: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  typeId: 't1',
  locale: 'en',
  translationGroup: 'g1',
  slug: 'lakeshore',
  status: 'draft',
  data: { f0: 'Removed', f1: 845000, f2: 'Lakeshore Drive' },
  revision: 1,
  createdAt: '2026-11-17T10:00:00.000Z',
  updatedAt: '2026-11-17T10:00:00.000Z',
  ...changes,
});

it('picks the text for a language, its base language, or whatever there is', () => {
  expect(localized({ en: 'Listings', es: 'Propiedades' }, 'es')).toBe('Propiedades');
  expect(localized({ en: 'Listings', es: 'Propiedades' }, 'es-ES')).toBe('Propiedades');
  expect(localized({ en: 'Listings' }, 'fr')).toBe('Listings');
  expect(localized({}, 'en')).toBe('');
});

it('titles an entry by its first live text field', () => {
  expect(entryTitle(type, entry().data)).toBe('Lakeshore Drive');
  expect(entryTitle(type, { f2: '  ' })).toBeNull();
  expect(entryTitle({ ...type, fields: [] }, entry().data)).toBeNull();
});

it('tells a published entry with newer saves from one that is up to date', () => {
  const published = { slug: 'lakeshore', data: {}, revision: 2, at: '2026-11-17T11:00:00.000Z' };
  expect(entryState(entry())).toBe('draft');
  expect(entryState(entry({ status: 'published', revision: 2, published }))).toBe('published');
  expect(entryState(entry({ status: 'published', revision: 3, published }))).toBe('unpublishedChanges');
});

it('changes one value in a copy, and removes a field that is emptied', () => {
  const values = { a: 1, b: 2 };
  expect(withValue(values, 'b', 3)).toEqual({ a: 1, b: 3 });
  expect(withValue(values, 'b', undefined)).toEqual({ a: 1 });
  expect(values).toEqual({ a: 1, b: 2 });
});

it('compares field values by content, not by the order of their fields', () => {
  expect(sameData({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
  expect(sameData({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  expect(sameData({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  expect(sameData({ a: [] }, { a: {} })).toBe(false);
  expect(sameData({ a: null }, { a: {} })).toBe(false);
});

it('names a language in the reader\'s language, and falls back to its tag', () => {
  expect(languageName('es', 'en')).toBe('Spanish');
  expect(languageName('en', 'es')).toBe('inglés');
  expect(languageName('not a tag', 'en')).toBe('not a tag');
});

it('puts translations of one entry together, led by the reader\'s language, in the list\'s order', () => {
  const es = entry({ id: 'e1-es', locale: 'es' });
  const other = entry({ id: 'e2', translationGroup: 'g2', locale: 'es' });
  const groups = groupTranslations([es, other, entry()], 'en-US');
  expect(groups.map((group) => group.versions.map((version) => version.id))).toEqual([['e1', 'e1-es'], ['e2']]);
  expect(groups[0]?.primary.id).toBe('e1');
});
