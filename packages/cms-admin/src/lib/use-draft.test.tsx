import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useDraft } from './use-draft.js';

const deal = { title: 'Roof', value: 100 as number | null, stage: 'new' };

it('shows what is saved, and sends only what was changed here', () => {
  const { result } = renderHook(() => useDraft(deal));
  expect(result.current.values).toEqual(deal);
  expect(result.current.hasChanges).toBe(false);
  act(() => result.current.set('title', 'Roof and gutters'));
  expect(result.current.values).toEqual({ ...deal, title: 'Roof and gutters' });
  expect(result.current.changed).toEqual({ title: 'Roof and gutters' });
  // Typed back to what is saved: nothing to send.
  act(() => result.current.set('title', 'Roof'));
  expect(result.current.hasChanges).toBe(false);
});

it('takes what someone else saved meanwhile wherever nothing was changed here, and keeps what was', () => {
  const { result, rerender } = renderHook(({ saved }) => useDraft(saved), { initialProps: { saved: deal } });
  act(() => result.current.set('title', 'Roof and gutters'));
  rerender({ saved: { ...deal, stage: 'won', value: 250 } });
  expect(result.current.values).toEqual({ title: 'Roof and gutters', stage: 'won', value: 250 });
  // The stage and the value are theirs: a save names the title alone, so neither is put back.
  expect(result.current.changed).toEqual({ title: 'Roof and gutters' });
  expect(result.current.clashes).toEqual([]);
});

it('names what was changed here and somewhere else too, until the two agree', () => {
  const { result, rerender } = renderHook(({ saved }) => useDraft(saved), { initialProps: { saved: deal } });
  act(() => result.current.set('title', 'Mine'));
  rerender({ saved: { ...deal, title: 'Theirs' } });
  expect(result.current.clashes).toEqual(['title']);
  expect(result.current.values.title).toBe('Mine');
  act(() => result.current.set('title', 'Theirs'));
  expect(result.current.clashes).toEqual([]);
  expect(result.current.hasChanges).toBe(false);
});

it('starts again from what is saved after a save', () => {
  const { result, rerender } = renderHook(({ saved }) => useDraft(saved), { initialProps: { saved: deal } });
  act(() => result.current.set('title', 'Mine'));
  rerender({ saved: { ...deal, title: 'Mine, as the server trimmed it' } });
  act(() => result.current.settle());
  expect(result.current.values.title).toBe('Mine, as the server trimmed it');
  expect(result.current.clashes).toEqual([]);
});
