import { expect, it } from 'vitest';
import { mergeEntryData } from './merge-entry.js';

const section = (id: string, data: Record<string, unknown>, more: Record<string, unknown> = {}) => ({ id, block: 'b-hero', data, ...more });

it('keeps a change only one side made, of either side', () => {
  const base = { title: 'Home', intro: 'Hello', price: 1 };
  const merged = mergeEntryData(base, { ...base, title: 'Home page' }, { ...base, intro: 'Welcome' }, 'mine');
  expect(merged).toEqual({ data: { title: 'Home page', intro: 'Welcome', price: 1 }, clashes: [] });
});

it('hands back what the form holds when nothing came in, so nothing is drawn again', () => {
  const base = { title: 'Home' };
  const mine = { title: 'Home page' };
  expect(mergeEntryData(base, mine, base, 'mine').data).toBe(mine);
  expect(mergeEntryData(base, mine, { title: 'Home page' }, 'theirs').data).toBe(mine);
});

it('names the field both sides changed, and lets either stand', () => {
  const base = { title: 'Home', intro: 'Hello' };
  const mine = { title: 'Mine', intro: 'Hello' };
  const theirs = { title: 'Theirs', intro: 'Welcome' };
  expect(mergeEntryData(base, mine, theirs, 'mine')).toEqual({ data: { title: 'Mine', intro: 'Welcome' }, clashes: ['title'] });
  expect(mergeEntryData(base, mine, theirs, 'theirs')).toEqual({ data: { title: 'Theirs', intro: 'Welcome' }, clashes: ['title'] });
});

it('takes a field one side added or cleared', () => {
  const base = { title: 'Home', intro: 'Hello' };
  expect(mergeEntryData(base, { title: 'Home' }, { ...base, more: 'New' }, 'mine')).toEqual({ data: { title: 'Home', more: 'New' }, clashes: [] });
});

it('brings sections together field by field: one side writes in one section, the other in another', () => {
  const base = { page: [section('a', { h: 'One', t: 'Text' }), section('b', { h: 'Two' })] };
  const mine = { page: [section('a', { h: 'One, typed', t: 'Text' }), section('b', { h: 'Two' })] };
  const theirs = { page: [section('a', { h: 'One', t: 'Text by the agent' }), section('b', { h: 'Two by the agent' })] };
  expect(mergeEntryData(base, mine, theirs, 'mine')).toEqual({
    data: { page: [section('a', { h: 'One, typed', t: 'Text by the agent' }), section('b', { h: 'Two by the agent' })] },
    clashes: [],
  });
});

it('keeps sections the other side added, moved or removed while this side wrote in one', () => {
  const base = { page: [section('a', { h: 'One' }), section('b', { h: 'Two' }), section('c', { h: 'Three' })] };
  const mine = { page: [section('a', { h: 'One, typed' }), section('b', { h: 'Two' }), section('c', { h: 'Three' })] };
  const theirs = { page: [section('new', { h: 'New' }), section('b', { h: 'Two' }), section('a', { h: 'One' })] };
  const merged = mergeEntryData(base, mine, theirs, 'mine');
  expect(merged).toEqual({ data: { page: [section('new', { h: 'New' }), section('b', { h: 'Two' }), section('a', { h: 'One, typed' })] }, clashes: [] });
  // And the other way round: this side arranged, the other wrote.
  expect(mergeEntryData(base, theirs, mine, 'mine')).toEqual(merged);
});

it('asks about a section one side removed and the other wrote in, and about lists both arranged', () => {
  const base = { page: [section('a', { h: 'One' }), section('b', { h: 'Two' })] };
  const typed = { page: [section('a', { h: 'One, typed' }), section('b', { h: 'Two' })] };
  const removed = { page: [section('b', { h: 'Two' })] };
  expect(mergeEntryData(base, typed, removed, 'mine')).toEqual({ data: typed, clashes: ['page'] });
  expect(mergeEntryData(base, typed, removed, 'theirs')).toEqual({ data: removed, clashes: ['page'] });
  const moved = { page: [section('b', { h: 'Two' }), section('a', { h: 'One' })] };
  expect(mergeEntryData(base, removed, moved, 'mine').clashes).toEqual(['page']);
});

it('names the page when both wrote in the same field of the same section, and keeps the rest of both', () => {
  const base = { page: [section('a', { h: 'One', t: 'Text' })] };
  const mine = { page: [section('a', { h: 'Mine', t: 'Text' })] };
  const theirs = { page: [section('a', { h: 'Theirs', t: 'Text by the agent' })] };
  expect(mergeEntryData(base, mine, theirs, 'mine')).toEqual({ data: { page: [section('a', { h: 'Mine', t: 'Text by the agent' })] }, clashes: ['page'] });
  expect(mergeEntryData(base, mine, theirs, 'theirs')).toEqual({ data: { page: [section('a', { h: 'Theirs', t: 'Text by the agent' })] }, clashes: ['page'] });
});

it('looks into sections inside a section, and takes a section hidden by one side', () => {
  const inner = (h: string, t: string) => [section('i', { h, t })];
  const base = { page: [section('row', { left: inner('One', 'Text') })] };
  const mine = { page: [section('row', { left: inner('One, typed', 'Text') })] };
  const theirs = { page: [section('row', { left: inner('One', 'Text by the agent') }, { hidden: true })] };
  expect(mergeEntryData(base, mine, theirs, 'mine')).toEqual({
    data: { page: [section('row', { left: inner('One, typed', 'Text by the agent') }, { hidden: true })] },
    clashes: [],
  });
});

it('treats any other value both changed as one thing: a list without ids, a group, formatted text', () => {
  const base = { photos: ['a.jpg'], address: { city: 'Austin', zip: '1' } };
  const mine = { photos: ['a.jpg', 'b.jpg'], address: { city: 'Dallas', zip: '1' } };
  const theirs = { photos: ['c.jpg'], address: { city: 'Austin', zip: '2' } };
  expect(mergeEntryData(base, mine, theirs, 'mine')).toEqual({ data: mine, clashes: ['photos', 'address'] });
});
