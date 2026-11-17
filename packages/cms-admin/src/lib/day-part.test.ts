import { expect, it } from 'vitest';
import { dayPart } from './day-part.js';

const at = (hour: number) => new Date(2026, 0, 5, hour, 30);

it('is morning from five until noon', () => {
  expect(dayPart(at(5))).toBe('morning');
  expect(dayPart(at(11))).toBe('morning');
});

it('is afternoon from noon until six', () => {
  expect(dayPart(at(12))).toBe('afternoon');
  expect(dayPart(at(17))).toBe('afternoon');
});

it('is evening after six and through the night', () => {
  expect(dayPart(at(18))).toBe('evening');
  expect(dayPart(at(2))).toBe('evening');
});
