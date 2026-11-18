import { isSlug } from '@velocity-astro/cms-core';
import { expect, it } from 'vitest';
import { slugify } from './slug.js';

it('makes a slug from a title', () => {
  expect(slugify('6214 Lakeshore Drive')).toBe('6214-lakeshore-drive');
  expect(slugify('  Café on 5th St. ')).toBe('cafe-on-5th-st');
  expect(slugify('¡¿?!')).toBe('');
});

it('always makes something the server accepts as a slug, or nothing', () => {
  for (const title of ['6214 Lakeshore Drive', 'Café — on 5th!', 'ÅÄÖ', '  a  b  ']) expect(isSlug(slugify(title))).toBe(true);
});
