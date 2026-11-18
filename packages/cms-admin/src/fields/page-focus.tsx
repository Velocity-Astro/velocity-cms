import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Which section the form and the page beside it are both looking at. The page says which
 * section was pressed on it, and the form opens it; the form says which section was opened, and
 * the page brings it into view. Neither knows the other is there.
 */
export interface PageFocus {
  /** The section last pressed on the page. `at` changes with every press, so pressing one twice counts twice. */
  readonly pressed: { readonly id: string; readonly at: number } | undefined;
  readonly press: (id: string) => void;
  /** The section last opened in the form. */
  readonly opened: string | undefined;
  readonly open: (id: string) => void;
}

const PageFocusContext = createContext<PageFocus | null>(null);

export function PageFocusProvider({ children }: { readonly children: ReactNode }) {
  const [pressed, setPressed] = useState<PageFocus['pressed']>(undefined);
  const [opened, setOpened] = useState<string | undefined>(undefined);
  const focus = useMemo<PageFocus>(
    () => ({ pressed, press: (id) => setPressed((last) => ({ id, at: (last?.at ?? 0) + 1 })), opened, open: setOpened }),
    [pressed, opened],
  );
  return <PageFocusContext value={focus}>{children}</PageFocusContext>;
}

/** The focus shared with the page beside the form, or nothing when no page is shown. */
export function usePageFocus(): PageFocus | null {
  return useContext(PageFocusContext);
}
