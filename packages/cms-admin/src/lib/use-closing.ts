import { useState } from 'react';

/**
 * For a dialog that is made anew each time it opens. It closes first and is taken away after,
 * so it is seen leaving: `close` starts that, and `onClose` is called once it has gone.
 */
export function useClosing(onClose: () => void) {
  const [isOpen, setOpen] = useState(true);
  return {
    close: () => setOpen(false),
    /** What the dialog itself takes. */
    dialog: { isOpen, onOpenChange: setOpen, onClosed: onClose },
  } as const;
}

/**
 * The last thing a dialog was about, kept while it leaves. A dialog asking about one row is
 * closed by forgetting the row, and would otherwise lose the row's name on its way out.
 */
export function useLast<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}
