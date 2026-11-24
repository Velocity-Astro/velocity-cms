import { useCallback, useReducer } from 'react';

/** Changes of one thing that follow each other this closely are one step: a word, not a letter. */
export const STEP_PAUSE_MS = 700;

/** How many steps back are kept. */
export const STEPS_KEPT = 100;

interface Steps<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** What the last change was to, and when: a change to the same thing soon after joins its step. */
  readonly mark: string | undefined;
  readonly at: number;
}

type Said<T> =
  | { readonly type: 'set'; readonly next: (current: T) => T; readonly mark: string | undefined; readonly at: number; readonly same: (a: T, b: T) => boolean }
  | { readonly type: 'settle' | 'restart'; readonly value: T }
  | { readonly type: 'rebase'; readonly onto: (value: T) => T }
  | { readonly type: 'undo' | 'redo' };

function steps<T>(state: Steps<T>, said: Said<T>): Steps<T> {
  if (said.type === 'set') {
    const value = said.next(state.present);
    if (said.same(value, state.present)) return state;
    const joins = said.mark !== undefined && said.mark === state.mark && said.at - state.at < STEP_PAUSE_MS && state.past.length > 0;
    return {
      past: joins ? state.past : [...state.past, state.present].slice(-STEPS_KEPT),
      present: value,
      future: [],
      mark: said.mark,
      at: said.at,
    };
  }
  if (said.type === 'settle') return { ...state, present: said.value, mark: undefined };
  if (said.type === 'rebase') return { ...state, past: state.past.map(said.onto), present: said.onto(state.present), future: state.future.map(said.onto), mark: undefined };
  if (said.type === 'restart') return { past: [], present: said.value, future: [], mark: undefined, at: 0 };
  if (said.type === 'undo') {
    const last = state.past.at(-1);
    if (last === undefined) return state;
    return { past: state.past.slice(0, -1), present: last, future: [state.present, ...state.future], mark: undefined, at: 0 };
  }
  const [next, ...future] = state.future;
  if (next === undefined) return state;
  return { past: [...state.past, state.present], present: next, future, mark: undefined, at: 0 };
}

/** A value and the steps that led to it, so a change can be taken back and made again. */
export interface History<T> {
  readonly value: T;
  /** Changes the value. Changes with the same `mark` that follow each other closely are one step. */
  readonly set: (next: (current: T) => T, mark?: string) => void;
  /** Takes a value as what is held now without a step: what the server made of a save. */
  readonly settle: (value: T) => void;
  /**
   * Changes the value and every step with it, without a step of its own: what someone else saved
   * is brought into each, so a step back takes back only what was done here.
   */
  readonly rebase: (onto: (value: T) => T) => void;
  /** Starts again from a value, with nothing to take back. */
  readonly restart: (value: T) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/**
 * Holds a value with its steps, in memory only. A change that leaves the value as it was (by
 * `same`) is no step, and a change after going back drops what was ahead.
 */
export function useHistory<T extends object>(start: T, same: (a: T, b: T) => boolean): History<T> {
  const [state, say] = useReducer(steps<T>, { past: [], present: start, future: [], mark: undefined, at: 0 });
  const set = useCallback((next: (current: T) => T, mark?: string) => say({ type: 'set', next, mark, at: Date.now(), same }), [same]);
  const settle = useCallback((value: T) => say({ type: 'settle', value }), []);
  const rebase = useCallback((onto: (value: T) => T) => say({ type: 'rebase', onto }), []);
  const restart = useCallback((value: T) => say({ type: 'restart', value }), []);
  const undo = useCallback(() => say({ type: 'undo' }), []);
  const redo = useCallback(() => say({ type: 'redo' }), []);
  return { value: state.present, set, settle, rebase, restart, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
