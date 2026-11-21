import { useEffect, useRef } from 'react';

/** Whether a key press asks to save: Ctrl or Command with S, and nothing else held. */
export function isSaveKey(event: { readonly key: string; readonly metaKey: boolean; readonly ctrlKey: boolean; readonly shiftKey: boolean; readonly altKey: boolean }): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's';
}

/**
 * Listens for the keys that save, anywhere on the screen, a field being typed in included. The
 * browser's own answer to them (saving the page as a file) is never wanted here, so it is
 * stopped whether or not there is anything to save.
 */
export function useSaveKey(save: () => void): void {
  const latest = useRef(save);
  useEffect(() => {
    latest.current = save;
  });
  useEffect(() => {
    const hear = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isSaveKey(event)) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', hear);
    return () => window.removeEventListener('keydown', hear);
  }, []);
}
