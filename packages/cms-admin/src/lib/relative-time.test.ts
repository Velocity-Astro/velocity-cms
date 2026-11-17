import { expect, it } from 'vitest';
import { relativeTime } from './relative-time.js';

const now = new Date('2026-11-17T12:00:00.000Z');

it('says how long ago in the largest unit that fits', () => {
  expect(relativeTime('2026-11-17T11:59:40.000Z', 'en', now)).toBe('now');
  expect(relativeTime('2026-11-17T11:15:00.000Z', 'en', now)).toBe('45 minutes ago');
  expect(relativeTime('2026-11-17T10:00:00.000Z', 'en', now)).toBe('2 hours ago');
  expect(relativeTime('2026-11-16T10:00:00.000Z', 'en', now)).toBe('yesterday');
  expect(relativeTime('2026-08-10T10:00:00.000Z', 'en', now)).toBe('3 months ago');
});

it('speaks the language asked for', () => {
  expect(relativeTime('2026-11-17T10:00:00.000Z', 'es', now)).toBe('hace 2 horas');
});
