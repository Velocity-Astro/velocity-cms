import { useState } from 'react';
import { AdminRequestError } from '../client/errors.js';
import { sameData } from './content.js';

/** What a small form holds while it is open: what is saved, with what was changed here over it. */
export interface Draft<T extends object> {
  /** What the form shows: the saved values as they are now, and what was changed here in their place. */
  readonly values: T;
  readonly set: <K extends keyof T>(key: K, value: T[K]) => void;
  /** Only what was changed here and differs from what is saved: what a save that names its changes sends. */
  readonly changed: Partial<T>;
  readonly hasChanges: boolean;
  /** What was changed here and, since then, somewhere else too, to something different. */
  readonly clashes: readonly (keyof T)[];
  /** Forgets what was changed here, after a save: the form shows what is saved. */
  readonly settle: () => void;
}

/**
 * The values of a form that is open for a while over something others may change (a deal, a
 * contact, a part of the settings).
 *
 * Only what the person changed is held here. Everything else is read from `saved` each time, so
 * what someone else saved meanwhile is in the form as soon as it is known, and a save never puts
 * back an older value of something this person did not touch: the hazard of a form that copies
 * every value when it opens and sends them all with the newest revision.
 */
export function useDraft<T extends object>(saved: T): Draft<T> {
  // What was changed here, and what each of those was when it was first changed.
  const [typed, setTyped] = useState<Partial<T>>({});
  const [from, setFrom] = useState<Partial<T>>({});
  const keys = Object.keys(typed) as (keyof T)[];
  const differing = keys.filter((key) => !sameData(typed[key], saved[key]));
  return {
    values: { ...saved, ...typed },
    set: (key, value) => {
      if (!(key in typed)) setFrom((before) => ({ ...before, [key]: saved[key] }));
      setTyped((before) => ({ ...before, [key]: value }));
    },
    changed: Object.fromEntries(differing.map((key) => [key, typed[key]])) as Partial<T>,
    hasChanges: differing.length > 0,
    clashes: differing.filter((key) => key in from && !sameData(from[key], saved[key])),
    settle: () => {
      setTyped({});
      setFrom({});
    },
  };
}

/** Whether a save was refused because someone else saved first. */
export const isConflict = (error: unknown) => error instanceof AdminRequestError && error.code === 'conflict';
