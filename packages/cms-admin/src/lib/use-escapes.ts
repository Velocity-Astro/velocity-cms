import { useEffect, useState } from 'react';

/**
 * How many times Escape has been pressed in the editor, where nothing else took it (a dialog, a menu).
 * The page beside the form is told each one (`PagePreview` `escapes`), so a drag on it or its list of
 * sections is closed by Escape wherever the keyboard is.
 */
export function useEscapes(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const hear = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setCount((now) => now + 1);
    };
    window.addEventListener('keydown', hear);
    return () => window.removeEventListener('keydown', hear);
  }, []);
  return count;
}
