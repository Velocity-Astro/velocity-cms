import type { Revision } from '@velocity-astro/cms-core';
import { expect, it } from 'vitest';
import { sittings } from './sittings.js';

const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 12, minute)).toISOString();
const save = (revision: number, minute: number, more: Partial<Revision> = {}): Revision => ({ entryId: 'e1', revision, slug: 'a', data: {}, status: 'draft', actorId: 'u1', createdAt: at(minute), ...more }) as Revision;
const shape = (folded: ReturnType<typeof sittings>) => folded.map((sitting) => [sitting.latest.revision, ...sitting.earlier.map((revision) => revision.revision)]);

it('folds saves one person made in one go, and keeps apart what a pause, another person or a publish divides', () => {
  const history = [
    save(8, 100, { actorId: 'u2' }),
    save(7, 99),
    save(6, 98),
    save(5, 60, { status: 'published' }),
    save(4, 59),
    save(3, 58),
    save(2, 20),
    save(1, 0),
  ];
  expect(shape(sittings(history, 5))).toEqual([[8], [7, 6], [5], [4, 3], [2], [1]]);
});

it('never folds the save visitors see into another', () => {
  const history = [save(3, 2, { status: 'published' }), save(2, 1, { status: 'published' }), save(1, 0, { status: 'published' })];
  expect(shape(sittings(history, 2))).toEqual([[3], [2], [1]]);
  expect(shape(sittings(history))).toEqual([[3, 2, 1]]);
});
