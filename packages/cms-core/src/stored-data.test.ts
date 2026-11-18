import { describe, expect, it } from 'vitest';
import { toStoredData } from './schema-builder.js';
import type { FieldDef } from './model.js';

const field = (id: string, key: string, type: string, options: Record<string, unknown> = {}): FieldDef => ({ id, key, type, label: { en: key }, required: false, translated: false, options });
const point = [field('f-name', 'name', 'text'), field('f-text', 'text', 'text')];
const fields: FieldDef[] = [
  field('f-title', 'title', 'text'),
  field('f-place', 'place', 'group', { fields: [field('f-city', 'city', 'text')] }),
  field('f-points', 'points', 'list', { of: { type: 'group', options: { fields: point } } }),
  field('f-body', 'body', 'blocks', { blocks: [{ id: 'b-hero', key: 'hero', label: { en: 'Hero' }, fields: [field('f-heading', 'heading', 'text')] }] }),
  { ...field('f-old', 'old', 'text'), deletedAt: '2026-01-01T00:00:00.000Z' },
];

describe('sample content written by key', () => {
  it('is stored by field id, down through groups, lists and sections', () => {
    let made = 0;
    const stored = toStoredData(fields, { title: 'Home', place: { city: 'Madison' }, points: [{ name: 'One', text: 'First.' }], body: [{ block: 'hero', data: { heading: 'Hello' } }, { id: 'kept', block: 'hero', data: {} }] }, () => `s-${++made}`);
    expect(stored).toEqual({
      'f-title': 'Home',
      'f-place': { 'f-city': 'Madison' },
      'f-points': [{ 'f-name': 'One', 'f-text': 'First.' }],
      'f-body': [{ id: 's-1', block: 'b-hero', data: { 'f-heading': 'Hello' } }, { id: 'kept', block: 'b-hero', data: {} }],
    });
  });

  it('refuses a key no field has, a removed field and a block that is not there', () => {
    expect(() => toStoredData(fields, { titel: 'Home' }, () => 'x')).toThrow(/no field "titel".*title, place, points, body/);
    expect(() => toStoredData(fields, { old: 'x' }, () => 'x')).toThrow(/no field "old"/);
    expect(() => toStoredData(fields, { body: [{ block: 'banner', data: {} }] }, () => 'x')).toThrow(/no block "banner".*hero/);
  });
});
