import type { PageItemAction, PageSectionAction, PageSectionTools } from '@velocity-astro/cms-ui';
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
  /** What the page may offer on each section (move, copy, remove, add beside it). The form says so, since it holds the sections. */
  readonly tools: PageSectionTools | undefined;
  readonly setTools: (tools: PageSectionTools | undefined) => void;
  /** The page says a section's button was pressed; whoever listens makes the change. */
  readonly acted: (id: string, action: PageSectionAction) => void;
  readonly onActed: (listener: ActedListener) => () => void;
  /** The page says a section was dragged to before another, or to the end (`null`). */
  readonly dragged: (id: string, beforeId: string | null) => void;
  readonly onDragged: (listener: DraggedListener) => () => void;
  /** The page says the button on a picture was pressed: the section, and the picture's field as keys. */
  readonly pictured: (id: string, field: string) => void;
  readonly onPictured: (listener: PicturedListener) => () => void;
  /** The page says the button on a link was pressed: the section, and the link's field as keys. */
  readonly linked: (id: string, field: string) => void;
  readonly onLinked: (listener: PicturedListener) => () => void;
  /** The page says a button on an item of a list was pressed: the section, the list's field as keys, the item's place and what to do. */
  readonly itemActed: ItemListener;
  readonly onItemActed: (listener: ItemListener) => () => void;
}

export type ItemListener = (id: string, field: string, at: number, action: PageItemAction) => void;

export type PicturedListener = (id: string, field: string) => void;

export type DraggedListener = (id: string, beforeId: string | null) => void;

export type ActedListener = (id: string, action: PageSectionAction) => void;

export type TypedListener = (id: string, field: string, words: string) => void;

const NOWHERE: Readonly<Record<string, readonly string[]>> = {};

const PageFocusContext = createContext<PageFocus | null>(null);

export function PageFocusProvider({ children }: { readonly children: ReactNode }) {
  const [pressed, setPressed] = useState<PageFocus['pressed']>(undefined);
  const [opened, setOpened] = useState<string | undefined>(undefined);
  const [typable, setPlaces] = useState(NOWHERE);
  const listeners = useRef(new Set<TypedListener>());
  const [tools, setOffered] = useState<PageSectionTools | undefined>(undefined);
  const acting = useRef(new Set<ActedListener>());
  const dragging = useRef(new Set<DraggedListener>());
  const picturing = useRef(new Set<PicturedListener>());
  const linking = useRef(new Set<PicturedListener>());
  const itemActing = useRef(new Set<ItemListener>());
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
      tools,
      setTools: (next) => setOffered((last) => (JSON.stringify(last) === JSON.stringify(next) ? last : next)),
      acted: (id, action) => acting.current.forEach((listener) => listener(id, action)),
      onActed: (listener) => {
        acting.current.add(listener);
        return () => void acting.current.delete(listener);
      },
      dragged: (id, beforeId) => dragging.current.forEach((listener) => listener(id, beforeId)),
      onDragged: (listener) => {
        dragging.current.add(listener);
        return () => void dragging.current.delete(listener);
      },
      pictured: (id, field) => picturing.current.forEach((listener) => listener(id, field)),
      onPictured: (listener) => {
        picturing.current.add(listener);
        return () => void picturing.current.delete(listener);
      },
      linked: (id, field) => linking.current.forEach((listener) => listener(id, field)),
      onLinked: (listener) => {
        linking.current.add(listener);
        return () => void linking.current.delete(listener);
      },
      itemActed: (id, field, at, action) => itemActing.current.forEach((listener) => listener(id, field, at, action)),
      onItemActed: (listener) => {
        itemActing.current.add(listener);
        return () => void itemActing.current.delete(listener);
      },
    }),
    [pressed, opened, typable, tools],
  );
  return <PageFocusContext value={focus}>{children}</PageFocusContext>;
}

/** The focus shared with the page beside the form, or nothing when no page is shown. */
export function usePageFocus(): PageFocus | null {
  return useContext(PageFocusContext);
}
