import { expect, it } from 'vitest';
import { parseCsv } from './csv.js';

it('reads rows of cells, trimmed, without the empty rows', () => {
  expect(parseCsv('\uFEFFName, Email\r\nAna Ruiz ,ana@example.com\r\n\r\n,,\nLi,li@example.com')).toEqual([
    ['Name', 'Email'],
    ['Ana Ruiz', 'ana@example.com'],
    ['Li', 'li@example.com'],
  ]);
});

it('reads a quoted cell that holds a comma, a line break and a quote', () => {
  expect(parseCsv('name,note\n"Ruiz, Ana","She said ""hello""\nand left"\n')).toEqual([
    ['name', 'note'],
    ['Ruiz, Ana', 'She said "hello"\nand left'],
  ]);
});

it('takes semicolons or tabs when the first line is separated by them', () => {
  expect(parseCsv('name;email\nAna, the first;ana@example.com')).toEqual([['name', 'email'], ['Ana, the first', 'ana@example.com']]);
  expect(parseCsv('name\temail\nAna\tana@example.com')).toEqual([['name', 'email'], ['Ana', 'ana@example.com']]);
});

it('answers with nothing for an empty file', () => {
  expect(parseCsv('')).toEqual([]);
  expect(parseCsv('\n\n')).toEqual([]);
});
