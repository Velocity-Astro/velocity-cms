// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { STEPS_KEPT, STEP_PAUSE_MS, useHistory } from './use-history.js';
import { undoKey } from './use-undo-keys.js';

interface Held {
  readonly title?: string;
  readonly body?: string;
}
const same = (a: Held, b: Held) => a.title === b.title && a.body === b.body;
const held = () => renderHook(() => useHistory<Held>({ title: 'One' }, same));

afterEach(() => vi.useRealTimers());

it('takes a change back and makes it again', () => {
  const { result } = held();
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.set((now) => ({ ...now, title: 'Two' })));
  act(() => result.current.set((now) => ({ ...now, body: 'Words' })));
  expect(result.current.value).toEqual({ title: 'Two', body: 'Words' });

  act(() => result.current.undo());
  expect(result.current.value).toEqual({ title: 'Two' });
  act(() => result.current.undo());
  expect(result.current.value).toEqual({ title: 'One' });
  expect(result.current.canUndo).toBe(false);
  // Nothing further back: asking again changes nothing.
  act(() => result.current.undo());
  expect(result.current.value).toEqual({ title: 'One' });

  act(() => result.current.redo());
  act(() => result.current.redo());
  expect(result.current.value).toEqual({ title: 'Two', body: 'Words' });
  expect(result.current.canRedo).toBe(false);
});

it('counts typing in one field as one step until there is a pause', () => {
  vi.useFakeTimers();
  const { result } = held();
  for (const title of ['One ', 'One m', 'One mo', 'One more']) {
    act(() => result.current.set((now) => ({ ...now, title }), 'title'));
    vi.advanceTimersByTime(100);
  }
  vi.advanceTimersByTime(STEP_PAUSE_MS);
  act(() => result.current.set((now) => ({ ...now, title: 'One more time' }), 'title'));
  // Another field soon after is its own step.
  act(() => result.current.set((now) => ({ ...now, body: 'Words' }), 'body'));

  act(() => result.current.undo());
  expect(result.current.value).toEqual({ title: 'One more time' });
  act(() => result.current.undo());
  expect(result.current.value).toEqual({ title: 'One more' });
  act(() => result.current.undo());
  expect(result.current.value).toEqual({ title: 'One' });
  // Typing after a step back starts a step of its own, and drops what was ahead.
  act(() => result.current.set((now) => ({ ...now, title: 'Other' }), 'title'));
  expect(result.current.canRedo).toBe(false);
  act(() => result.current.undo());
  expect(result.current.value).toEqual({ title: 'One' });
});

it('makes no step of a change that changes nothing, or of what a save came back as', () => {
  const { result } = held();
  act(() => result.current.set((now) => ({ ...now })));
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.set((now) => ({ ...now, title: 'Two' })));
  act(() => result.current.settle({ title: 'Two', body: '' }));
  expect(result.current.value).toEqual({ title: 'Two', body: '' });
  // What was typed before the save can still be taken back.
  act(() => result.current.undo());
  expect(result.current.value).toEqual({ title: 'One' });
});

it('starts again with nothing to take back, and keeps only so many steps', () => {
  const { result } = held();
  for (let step = 0; step < STEPS_KEPT + 5; step += 1) act(() => result.current.set((now) => ({ ...now, title: `Step ${step}` })));
  for (let step = 0; step < STEPS_KEPT + 5; step += 1) act(() => result.current.undo());
  expect(result.current.value).toEqual({ title: 'Step 4' });
  act(() => result.current.restart({ title: 'Brought back' }));
  expect(result.current.value).toEqual({ title: 'Brought back' });
  expect(result.current.canUndo).toBe(false);
  expect(result.current.canRedo).toBe(false);
});

it('knows the keys that ask for a step back and a step forward', () => {
  const key = (key: string, held: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) =>
    undoKey({ key, metaKey: held.meta === true, ctrlKey: held.ctrl === true, shiftKey: held.shift === true, altKey: held.alt === true });
  expect(key('z', { meta: true })).toBe('undo');
  expect(key('z', { ctrl: true })).toBe('undo');
  expect(key('Z', { meta: true, shift: true })).toBe('redo');
  expect(key('y', { ctrl: true })).toBe('redo');
  expect(key('z')).toBeNull();
  expect(key('y', { meta: true })).toBeNull();
  expect(key('z', { ctrl: true, alt: true })).toBeNull();
});
