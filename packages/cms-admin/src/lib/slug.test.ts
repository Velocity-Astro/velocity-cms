import { expect, it } from 'vitest';
import { isSlug, slugify } from './slug.js';

it('makes a slug from a title', () => {
  expect(slugify('6214 Lakeshore Drive')).toBe('6214-lakeshore-drive');
  expect(slugify('  Café on 5th St. ')).toBe('cafe-on-5th-st');
  expect(slugify('¡¿?!')).toBe('');
});

it('accepts lowercase words joined by single hyphens, and nothing else', () => {
  expect(isSlug('lake-house-2')).toBe(true);
  for (const bad of ['', 'Lake', 'lake house', '-lake', 'lake-', 'lake--house', 'lake/house']) expect(isSlug(bad)).toBe(false);
});
