import { useEffect, useState } from 'react';

/** A window narrower than this, in pixels, is taken to be a phone. */
export const NARROW = 640;

const narrow = () => (typeof window.matchMedia === 'function' ? window.matchMedia(`(max-width: ${NARROW - 1}px)`) : null);

/** Whether the window is as narrow as a phone, now and as it is turned or resized. */
export function useNarrow(): boolean {
  const [isNarrow, setNarrow] = useState(() => narrow()?.matches ?? false);
  useEffect(() => {
    const watched = narrow();
    if (!watched) return;
    const follow = () => setNarrow(watched.matches);
    watched.addEventListener('change', follow);
    follow();
    return () => watched.removeEventListener('change', follow);
  }, []);
  return isNarrow;
}
