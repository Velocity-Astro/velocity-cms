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
  /** Counts every opening, so a section opened again (closed and opened, or chosen twice) is brought into view again. */
  readonly openedAt: number;
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
  readonly dragged: DraggedListener;
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
  /** The page says a swatch on a section's bar was pressed: the section, the field as keys and the choice. */
  readonly swatched: SwatchListener;
  readonly onSwatched: (listener: SwatchListener) => () => void;
  /** The page says the button of an empty place inside a section was pressed: the section, and the place's field as keys. */
  readonly slotted: PicturedListener;
  readonly onSlotted: (listener: PicturedListener) => () => void;
  /** Who else is working in which section now: for a section's id, words that say who ("Ana Ruiz is here"). The entry's form says so. */
  readonly company: Readonly<Record<string, string>>;
  readonly setCompany: (company: Readonly<Record<string, string>>) => void;
  /** True for sections inside a section, which the field that holds the page answers for. */
  readonly isInside?: boolean;
}

export type SwatchListener = (id: string, field: string, value: string) => void;

export type ItemListener = (id: string, field: string, at: number, action: PageItemAction) => void;

export type PicturedListener = (id: string, field: string) => void;

/** `into` names the place inside a section it was let go in, where that is not the place it was in. */
export type DraggedListener = (id: string, beforeId: string | null, into?: string) => void;

export type ActedListener = (id: string, action: PageSectionAction) => void;

export type TypedListener = (id: string, field: string, words: string) => void;

const NOWHERE: Readonly<Record<string, readonly string[]>> = {};
const NOBODY: Readonly<Record<string, string>> = {};

const PageFocusContext = createContext<PageFocus | null>(null);

export function PageFocusProvider({ children }: { readonly children: ReactNode }) {
  const [pressed, setPressed] = useState<PageFocus['pressed']>(undefined);
  const [opened, setOpened] = useState<string | undefined>(undefined);
  const [openedAt, setOpenedAt] = useState(0);
  const [typable, setPlaces] = useState(NOWHERE);
  const listeners = useRef(new Set<TypedListener>());
  const [tools, setOffered] = useState<PageSectionTools | undefined>(undefined);
  const [company, setTogether] = useState<Readonly<Record<string, string>>>(NOBODY);
  const acting = useRef(new Set<ActedListener>());
  const dragging = useRef(new Set<DraggedListener>());
  const picturing = useRef(new Set<PicturedListener>());
  const linking = useRef(new Set<PicturedListener>());
  const itemActing = useRef(new Set<ItemListener>());
  const swatching = useRef(new Set<SwatchListener>());
  const slotting = useRef(new Set<PicturedListener>());
  const focus = useMemo<PageFocus>(
    () => ({
      pressed,
      press: (id, field) => setPressed((last) => ({ id, ...(field !== undefined && { field }), at: (last?.at ?? 0) + 1 })),
      opened,
      openedAt,
      open: (id) => {
        setOpened(id);
        setOpenedAt((count) => count + 1);
      },
      typable,
      // The same places said again change nothing, so the page is not told twice.
      setTypable: (places) => setPlaces((last) => (JSON.stringify(last) === JSON.stringify(places) ? last : places)),
      typed: (id, field, words) => listeners.current.forEach((listener) => listener(id, field, words)),
      onTyped: (listener) => {
        listeners.current.add(listener);
        return () => void listeners.current.delete(listener);
      },
      company,
      setCompany: (next) => setTogether((last) => (JSON.stringify(last) === JSON.stringify(next) ? last : next)),
      tools,
      setTools: (next) => setOffered((last) => (JSON.stringify(last) === JSON.stringify(next) ? last : next)),
      acted: (id, action) => acting.current.forEach((listener) => listener(id, action)),
      onActed: (listener) => {
        acting.current.add(listener);
        return () => void acting.current.delete(listener);
      },
      dragged: (id, beforeId, into) => dragging.current.forEach((listener) => listener(id, beforeId, into)),
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
      swatched: (id, field, value) => swatching.current.forEach((listener) => listener(id, field, value)),
      onSwatched: (listener) => {
        swatching.current.add(listener);
        return () => void swatching.current.delete(listener);
      },
      slotted: (id, field) => slotting.current.forEach((listener) => listener(id, field)),
      onSlotted: (listener) => {
        slotting.current.add(listener);
        return () => void slotting.current.delete(listener);
      },
    }),
    [pressed, opened, openedAt, typable, tools, company],
  );
  return <PageFocusContext value={focus}>{children}</PageFocusContext>;
}

/** The focus shared with the page beside the form, or nothing when no page is shown. */
export function usePageFocus(): PageFocus | null {
  return useContext(PageFocusContext);
}

const unheard = () => () => undefined;

/**
 * The focus as the sections inside a section see it. They open what is pressed on the page and
 * say what was opened, and nothing more: the field that holds the whole page answers for every
 * section in it, however deep, so nothing is done twice.
 */
export function PageFocusInside({ children }: { readonly children: ReactNode }) {
  const focus = useContext(PageFocusContext);
  const inside = useMemo<PageFocus | null>(
    () =>
      focus && {
        ...focus,
        setTypable: () => undefined,
        setTools: () => undefined,
        setCompany: () => undefined,
        onTyped: unheard,
        onActed: unheard,
        onDragged: unheard,
        onPictured: unheard,
        onLinked: unheard,
        onItemActed: unheard,
        onSwatched: unheard,
        onSlotted: unheard,
        isInside: true,
      },
    [focus],
  );
  return <PageFocusContext value={inside}>{children}</PageFocusContext>;
}
