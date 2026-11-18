import type { ContentTypeDef, FieldDef } from '@velocity-astro/cms-core';
import { expect, it } from 'vitest';
import { NO_SECTION, moved, placeOf, placed, placesOf } from './arrangement.js';

const field = (id: string, deletedAt?: string): FieldDef => ({ id, key: id, type: 'text', label: { en: id }, translated: true, required: false, options: {}, ...(deletedAt !== undefined && { deletedAt }) });
const type: ContentTypeDef = {
  id: 't',
  key: 'agents',
  kind: 'collection',
  label: { en: 'Agents' },
  fields: [field('name'), field('bio'), field('gone', '2026-11-17T00:00:00.000Z'), field('phone'), field('email')],
  sections: [
    { key: 'about', label: { en: 'About' }, fieldIds: ['bio', 'name', 'gone'] },
    { key: 'contact', label: { en: 'Contact' }, fieldIds: [] },
  ],
};
const keys = (places: ReturnType<typeof placesOf>) => places.map((place) => [place.key, place.fields.map((item) => item.id)]);

it('groups live fields as the editor shows them: each section, then the rest', () => {
  expect(keys(placesOf(type))).toEqual([['about', ['bio', 'name']], ['contact', []], [NO_SECTION, ['phone', 'email']]]);
  expect(keys(placesOf({ ...type, sections: [] }))).toEqual([[NO_SECTION, ['name', 'bio', 'phone', 'email']]]);
  expect(placeOf(type, 'name')).toBe('about');
  expect(placeOf(type, 'phone')).toBe(NO_SECTION);
});

it('moves a field a step among the fields it is shown with, and not past the ends', () => {
  expect(moved(type, 'name', -1)).toEqual({ order: ['name', 'bio', 'phone', 'email'], sections: { about: ['name', 'bio'], contact: [] } });
  expect(moved(type, 'phone', 1)).toEqual({ order: ['bio', 'name', 'email', 'phone'], sections: { about: ['bio', 'name'], contact: [] } });
  expect(moved(type, 'bio', -1).order).toEqual(['bio', 'name', 'phone', 'email']);
});

it('puts a field at the end of another section, or of none', () => {
  expect(placed(type, 'phone', 'contact')).toEqual({ order: ['bio', 'name', 'phone', 'email'], sections: { about: ['bio', 'name'], contact: ['phone'] } });
  expect(placed(type, 'bio', NO_SECTION)).toEqual({ order: ['name', 'phone', 'email', 'bio'], sections: { about: ['name'], contact: [] } });
});
