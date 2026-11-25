import { expect, it } from 'vitest';
import { differingWords, wordsIn } from './value-words.js';

it('finds the words and numbers a value holds, however deep, and not the ids of its sections', () => {
  expect(wordsIn('  Home ')).toEqual(['Home']);
  expect(wordsIn([{ id: 's1', block: 'b-hero', data: { h: 'One', n: 3, on: true, more: [{ t: 'Two' }] } }])).toEqual(['One', '3', 'Two']);
  expect(wordsIn(undefined)).toEqual([]);
});

it('says what one version holds that the other does not', () => {
  expect(differingWords('Mine', 'Theirs')).toBe('Mine');
  const mine = [{ id: 'a', block: 'b', data: { h: 'Same', t: 'My text' } }];
  const theirs = [{ id: 'a', block: 'b', data: { h: 'Same', t: 'Their text' } }];
  expect(differingWords(mine, theirs)).toBe('My text');
  expect(differingWords(theirs, mine)).toBe('Their text');
  // An order is no word.
  expect(differingWords(['a', 'b'], ['b', 'a'])).toBe('');
});

it('cuts what is long', () => {
  expect(differingWords('word '.repeat(100), '', 20)).toBe('word word word word…');
});
