import { expect, it } from 'vitest';
import { fieldMark, sectionMark } from './page-marks.js';
import { asPreview } from './preview.js';

const draft = { id: 'p1', data: {} };

it('marks sections and fields beside the editor\'s form', () => {
  asPreview(() => {
    expect(sectionMark('s1')).toEqual({ 'data-cms-section': 's1' });
    expect(fieldMark('title')).toEqual({ 'data-cms-field': 'title' });
    expect(fieldMark('items', 2, 'text')).toEqual({ 'data-cms-field': 'items.2.text' });
    expect(fieldMark()).toEqual({});
  }, draft);
});

it('marks nothing on a visitor\'s page, or in a preview link that is only read', () => {
  expect(sectionMark('s1')).toEqual({});
  expect(fieldMark('title')).toEqual({});
  asPreview(() => {
    expect(sectionMark('s1')).toEqual({});
    expect(fieldMark('title')).toEqual({});
  });
});
