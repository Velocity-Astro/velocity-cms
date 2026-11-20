import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * Which section the form and the page beside it are both looking at. The page says which
 * section was pressed on it, and the form opens it; the form says which section was opened, and
 * the page brings it into view. Neither knows the other is there.
 */
export interface PageFocus {
  /**
   * The section last pressed on the page, and the field of it that was pressed, as keys
   * (`title`, `items.0.text`), where the page marks its fields. `at` changes with every press, so
   * pressing one twice counts twice.
   */
  readonly pressed: { readonly id: string; readonly field?: string; readonly at: number } | undefined;
  readonly press: (id: string, field?: string) => void;
  /** The section last opened in the form. */
  readonly opened: string | undefined;
  readonly open: (id: string) => void;
  /**
   * Where words may be typed on the page itself: for each section's id, its fields as keys. The
   * form says so, since only it knows which fields hold plain words.
   */
  readonly typable: Readonly<Record<string, readonly string[]>>;
  readonly setTypable: (places: Readonly<Record<string, readonly string[]>>) => void;
  /** The page says what a field now holds, as it is typed there; whoever listens puts it in the form. */
  readonly typed: (id: string, field: string, words: string) => void;
  /** Listens to what is typed on the page. Answers with how to stop. */
  readonly onTyped: (listener: TypedListener) => () => void;
}

export type TypedListener = (id: string, field: string, words: string) => void;

const NOWHERE: Readonly<Record<string, readonly string[]>> = {};

const PageFocusContext = createContext<PageFocus | null>(null);

export function PageFocusProvider({ children }: { readonly children: ReactNode }) {
  const [pressed, setPressed] = useState<PageFocus['pressed']>(undefined);
  const [opened, setOpened] = useState<string | undefined>(undefined);
  const [typable, setPlaces] = useState(NOWHERE);
  const listeners = useRef(new Set<TypedListener>());
  const focus = useMemo<PageFocus>(
    () => ({
      pressed,
      press: (id, field) => setPressed((last) => ({ id, ...(field !== undefined && { field }), at: (last?.at ?? 0) + 1 })),
      opened,
      open: setOpened,
      typable,
      // The same places said again change nothing, so the page is not told twice.
      setTypable: (places) => setPlaces((last) => (JSON.stringify(last) === JSON.stringify(places) ? last : places)),
      typed: (id, field, words) => listeners.current.forEach((listener) => listener(id, field, words)),
      onTyped: (listener) => {
        listeners.current.add(listener);
        return () => void listeners.current.delete(listener);
      },
    }),
    [pressed, opened, typable],
  );
  return <PageFocusContext value={focus}>{children}</PageFocusContext>;
}

/** The focus shared with the page beside the form, or nothing when no page is shown. */
export function usePageFocus(): PageFocus | null {
  return useContext(PageFocusContext);
}
