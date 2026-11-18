import { useEffect } from 'react';
import { useBlocker } from 'react-router';

/** A move to another screen that is waiting for the person to say whether to go. */
export interface LeaveGuard {
  /** True while a move is waiting for an answer. */
  readonly isAsking: boolean;
  /** Go where the person was heading, dropping what was typed. */
  readonly leave: () => void;
  /** Stay on this screen. */
  readonly stay: () => void;
}

/**
 * Holds the person on a screen while `hasUnsavedWork` is true: a move to another screen waits
 * for an answer, and the browser asks in its own words before the tab is closed or reloaded.
 * The screen shows the question while `isAsking`.
 */
export function useLeaveGuard(hasUnsavedWork: boolean): LeaveGuard {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => hasUnsavedWork && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!hasUnsavedWork) return undefined;
    // The browser shows its own question; a page cannot word it.
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [hasUnsavedWork]);

  // Saved while the question was showing: nothing would be lost any more, so go.
  useEffect(() => {
    if (blocker.state === 'blocked' && !hasUnsavedWork) blocker.proceed();
  }, [blocker, hasUnsavedWork]);

  return {
    isAsking: blocker.state === 'blocked',
    leave: () => blocker.proceed?.(),
    stay: () => blocker.reset?.(),
  };
}
