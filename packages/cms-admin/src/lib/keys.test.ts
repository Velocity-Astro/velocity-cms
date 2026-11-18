import { expect, it } from 'vitest';
import { fieldKeyFrom, typeKeyFrom } from './keys.js';

it('makes a field key the way code writes one', () => {
  expect(fieldKeyFrom('Listed on')).toBe('listedOn');
  expect(fieldKeyFrom('  Année de construction! ')).toBe('anneeDeConstruction');
  expect(fieldKeyFrom('3D tour')).toBe('dTour');
  expect(fieldKeyFrom('2024')).toBe('');
});

it('makes a content type key the way an address writes one', () => {
  expect(typeKeyFrom('Case studies')).toBe('case-studies');
  expect(typeKeyFrom('FAQ & Help')).toBe('faq-help');
  expect(typeKeyFrom('')).toBe('');
});
