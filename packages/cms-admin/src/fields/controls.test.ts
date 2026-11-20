import type { FieldDef } from '@velocity-astro/cms-core';
import { expect, it } from 'vitest';
import { createFieldControls } from './controls.js';

const controls = createFieldControls();
/** In the tests a field type's control is named after it. */
const controlFor = (type: string) => (controls.has(type) ? controls.get(type) : type === 'text' ? controls.get('text-input') : undefined);
const field = (id: string, type: string, options: Record<string, unknown> = {}): FieldDef => ({ id, key: id, type, label: { en: id }, translated: true, required: false, options });
const places = (of: FieldDef, value: unknown) => controlFor(of.type)?.words?.(of, value, controlFor) ?? [];

it('says text is its own words, and an empty text field a place for them', () => {
  const [place] = places(field('title', 'text'), 'Welcome');
  expect(place?.place).toBe('');
  expect(place?.put('Hello')).toBe('Hello');
  expect(place?.put('')).toBeUndefined();
  expect(places(field('title', 'text'), undefined)).toHaveLength(1);
  expect(places(field('title', 'text'), 7)).toEqual([]);
});

it('finds the words inside a list of groups by place, and changes only the item typed into', () => {
  const cards = field('items', 'list', { of: { type: 'group', options: { fields: [field('title', 'text'), field('count', 'number'), field('tags', 'list', { of: { type: 'text', options: {} } })] } } });
  const value = [{ title: 'Buy', count: 2, tags: ['a', 'b'] }, { title: 'Sell' }];
  const found = places(cards, value);
  expect(found.map(({ place }) => place)).toEqual(['0.title', '0.tags.0', '0.tags.1', '1.title']);
  expect(found[2]?.put('z')).toEqual([{ title: 'Buy', count: 2, tags: ['a', 'z'] }, { title: 'Sell' }]);
  // An item emptied on the page keeps its place in the list, so the ones after it keep theirs.
  expect(found[3]?.put('')).toEqual([{ title: 'Buy', count: 2, tags: ['a', 'b'] }, {}]);
  expect(found[1]?.put('')).toEqual([{ title: 'Buy', count: 2, tags: ['', 'b'] }, { title: 'Sell' }]);
});

it('offers no place in a field that holds no plain words', () => {
  expect(places(field('look', 'select'), 'Bold')).toEqual([]);
  expect(places(field('items', 'list', { of: { type: 'select', options: {} } }), ['Bold'])).toEqual([]);
});
