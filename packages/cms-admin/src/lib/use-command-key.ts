import { useEffect, useRef } from 'react';

/** Whether a key press asks for the search: Ctrl or Command with K, and nothing else held. */
export function isCommandKey(event: { readonly key: string; readonly metaKey: boolean; readonly ctrlKey: boolean; readonly shiftKey: boolean; readonly altKey: boolean }): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';
}

/** Whether the person's keyboard has a Command key, so the shortcut is shown as they press it. */
export function hasCommandKey(): boolean {
  return typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

/**
 * Listens for the keys that open the search, anywhere on the screen, a field being typed in
 * included: the browser's own answer to them (its address bar) is not wanted while in the editor.
 */
export function useCommandKey(open: () => void): void {
  const latest = useRef(open);
  useEffect(() => {
    latest.current = open;
  });
  useEffect(() => {
    const hear = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isCommandKey(event)) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', hear);
    return () => window.removeEventListener('keydown', hear);
  }, []);
}
