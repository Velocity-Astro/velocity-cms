import { useEffect, useRef } from 'react';

/** Which of the two a key press asks for: Ctrl or Command with Z, with Shift (or Ctrl with Y) for again. */
export function undoKey(event: { readonly key: string; readonly metaKey: boolean; readonly ctrlKey: boolean; readonly shiftKey: boolean; readonly altKey: boolean }): 'undo' | 'redo' | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && event.ctrlKey && !event.shiftKey) return 'redo';
  return null;
}

const NOT_TYPED = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'];

/** Whether the browser has an undo of its own where the keys were pressed: somewhere words are typed. */
function typesHere(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // A switch and a checkbox are inputs too, and hold no typing to take back.
  if (target instanceof HTMLInputElement) return !NOT_TYPED.includes(target.type);
  return target instanceof HTMLTextAreaElement || target.isContentEditable;
}

/**
 * Listens for the keys that take a change back and make it again, anywhere on the screen but
 * where words are being typed: there the browser takes back the typing itself.
 */
export function useUndoKeys(undo: () => void, redo: () => void): void {
  const latest = useRef({ undo, redo });
  useEffect(() => {
    latest.current = { undo, redo };
  });
  useEffect(() => {
    const hear = (event: KeyboardEvent) => {
      if (event.defaultPrevented || typesHere(event.target)) return;
      const asked = undoKey(event);
      if (asked === null) return;
      event.preventDefault();
      latest.current[asked]();
    };
    window.addEventListener('keydown', hear);
    return () => window.removeEventListener('keydown', hear);
  }, []);
}
