import { expect, it } from 'vitest';
import { fieldMark, partMark, sectionMark } from './page-marks.js';
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

it('says what a section holds, each with its place, so the page finds its fields by their words', () => {
  asPreview(() => {
    const mark = sectionMark('s1', {
      title: 'Welcome',
      empty: ' ',
      count: 3,
      body: { html: '<p>Hello</p>' },
      blank: { html: '' },
      link: { type: 'entry', group: 'g1' },
      items: [{ text: 'First' }, { text: 'Second', points: ['a'] }],
    });
    expect(mark['data-cms-section']).toBe('s1');
    expect(JSON.parse(mark['data-cms-values'] ?? '')).toEqual([
      ['title', 'Welcome'],
      ['body', '<p>Hello</p>', 'html'],
      ['link.type', 'entry'],
      ['link.group', 'g1'],
      ['items.0.text', 'First'],
      ['items.1.text', 'Second'],
      ['items.1.points.0', 'a'],
    ]);
    expect(sectionMark('s1', {})).toEqual({ 'data-cms-section': 's1' });
  }, draft);
  expect(sectionMark('s1', { title: 'Welcome' })).toEqual({});
});

it('marks a part every page shows with the single pages it comes from, and their words by page', () => {
  expect(partMark({ navigation: { header: [{ label: 'Docs' }] } })).toEqual({});
  asPreview(() => {
    const mark = partMark({ 'site-header-footer': { announceBold: 'Open beta', announce: true }, navigation: { header: [{ label: 'Docs' }] }, 'Not a key': { a: 'b' } });
    expect(mark['data-cms-part']).toBe('site-header-footer navigation');
    expect(JSON.parse(mark['data-cms-values'] ?? '')).toEqual([
      ['site-header-footer:announceBold', 'Open beta'],
      ['navigation:header.0.label', 'Docs'],
    ]);
    expect(partMark({ settings: {} })).toEqual({ 'data-cms-part': 'settings' });
    expect(partMark({})).toEqual({});
  }, draft);
});
