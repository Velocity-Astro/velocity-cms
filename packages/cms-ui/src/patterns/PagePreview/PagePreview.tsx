import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  pagePreviewBarClass,
  pagePreviewVariants,
  pagePreviewEmptyClass,
  pagePreviewFrameVariants,
  pagePreviewNoteClass,
  pagePreviewStageVariants,
  pagePreviewWidths,
  type PagePreviewVariants,
} from './PagePreview.variants.js';

/** How long the page waits after the last change before it is drawn again, in milliseconds. */
const PAUSE = 500;
/** The name both sides put on what they say to each other, so nothing else is taken for it. */
const SOURCE = 'velocity-cms';
/** How long after words were typed on the page a change of the draft is taken to be those words, in milliseconds. */
const OWN = 250;
/** How close a change of the draft and a section asked for must be to be one act, such as a section moved, in milliseconds. */
const TOGETHER = 100;
/** How much of a screen's width a pane must have for the page to be shown at the pane's own width. */
const NEARLY = 0.9;

interface Said {
  readonly source?: unknown;
  readonly type?: unknown;
  readonly id?: unknown;
  readonly field?: unknown;
  readonly words?: unknown;
  readonly action?: unknown;
  readonly before?: unknown;
  readonly at?: unknown;
  readonly form?: unknown;
  readonly href?: unknown;
  readonly value?: unknown;
  readonly into?: unknown;
}

/** What can be done to a section from the page itself. */
const ACTIONS = ['up', 'down', 'duplicate', 'remove', 'addBefore', 'addAfter'] as const;
export type PageSectionAction = (typeof ACTIONS)[number];
const ITEM_ACTIONS = ['up', 'down', 'duplicate', 'remove'] as const;
/** What can be done to one item of a list from the page. */
export type PageItemAction = (typeof ITEM_ACTIONS)[number];

/** A look of a section chosen among a few of the site's colours: its field, what it is called, each choice with a sample, and the one chosen. */
export interface PageSectionSwatches {
  readonly field: string;
  readonly name: string;
  readonly chosen?: string;
  readonly choices: readonly { readonly value: string; readonly name: string; readonly colour: string }[];
}

export interface PageSectionTools {
  /** What each button is called, shown when the pointer rests on it, and the words on the button that adds a section. */
  readonly labels: { readonly up: string; readonly down: string; readonly duplicate: string; readonly remove: string; readonly add: string; readonly addBefore: string; readonly addAfter: string; readonly picture?: string; readonly link?: string; readonly bold?: string; readonly italic?: string; readonly textLink?: string; readonly itemUp?: string; readonly itemDown?: string; readonly itemDuplicate?: string; readonly itemRemove?: string };
  /** For each section's id: what it is called, and what can be done to it now. */
  readonly sections: Readonly<Record<string, { readonly name: string; readonly up: boolean; readonly down: boolean; readonly copy: boolean; readonly add: boolean; readonly pictures?: readonly string[]; readonly links?: readonly string[]; readonly lists?: readonly { readonly field: string; readonly count: number; readonly full: boolean }[]; readonly swatches?: readonly PageSectionSwatches[]; readonly list?: string; readonly group?: string }>>;
  /**
   * The places inside sections that hold sections of their own, each by the section it is in and its field (`id:columns.0.content`):
   * which places take each other's sections (`group`), and whether one is empty or takes no more.
   */
  readonly slots?: Readonly<Record<string, { readonly group: string; readonly empty: boolean; readonly full: boolean }>>;
}

export interface PagePreviewProps extends PagePreviewVariants {
  /** Names the frame for screen readers: "Why list with us, as it would look". */
  readonly label: string;
  /**
   * Where the page is asked for, on this site. Each time `draft` changes it is sent there and
   * the answer is shown. Left out, there is no page yet and `emptyText` is shown.
   */
  readonly address?: string | undefined;
  /** What is in the form now, as text. It is sent in a form field named `draft`. */
  readonly draft: string;
  /** A line about what the page shows: "Shows the form as it is now, saved or not". */
  readonly note?: string;
  /** Controls for the preview, such as the choice of width. */
  readonly toolbar?: ReactNode;
  /** The one thing to do with the page, such as opening it larger: a `Button` at the start of the bar, in place of `note`. */
  readonly action?: ReactNode;
  /** Shown in place of the page when there is no `address`. */
  readonly emptyText: string;
  /**
   * Called with a section's id when it is pressed on the page, and with the field that was
   * pressed, as keys (`title`, `items.0.text`), where the page marks its fields.
   */
  readonly onSectionPress?: (id: string, field?: string, inForm?: boolean) => void;
  /**
   * Called when the page asks where a link in text being written there should lead, with the
   * address it has now (or none) and how to answer: an address, nothing to take the link away,
   * or `null` to leave it as it is. Ask the person, then answer.
   */
  readonly onTextLink?: (href: string, answer: (href: string | null) => void) => void;
  /** Called when a swatch on a section's bar is pressed: the section, the field and the choice. Whoever holds the sections makes the change. */
  readonly onSectionSwatch?: (id: string, field: string, value: string) => void;
  /** Called when the keys that take a change back are pressed on the page. The page takes nothing back itself. */
  readonly onUndo?: () => void;
  /** Called when the keys that make a change again are pressed on the page. */
  readonly onRedo?: () => void;
  /** Called when the keys that save are pressed on the page. The page saves nothing itself. */
  readonly onSave?: () => void;
  /** The section the page should have in view, and outlined. */
  readonly shownSectionId?: string;
  /**
   * Where words may be typed on the page itself: for each section's id, the fields of it, as keys
   * (`title`, `items.0.text`). Left out, the page is only looked at and pressed.
   */
  readonly typable?: Readonly<Record<string, readonly string[]>>;
  /**
   * Called as words are typed into a field on the page, with all the field now says. The page
   * already shows them, so the change of `draft` that follows asks for no new page.
   */
  readonly onWords?: (id: string, field: string, words: string) => void;
  /**
   * Puts a small bar on the section the pointer is in (move up, move down, copy, remove) and a
   * button at each of its edges that adds a section there. Left out, the page has none.
   */
  readonly tools?: PageSectionTools;
  /** Called when a button of `tools` is pressed on the page. The page changes nothing itself. */
  readonly onSectionAction?: (id: string, action: PageSectionAction) => void;
  /**
   * Called when a section is dragged by its bar and let go: with the section it should now come
   * before, or `null` for after the last.
   */
  readonly onSectionMove?: (id: string, beforeId: string | null, into?: string) => void;
  /** Called when the button of an empty place inside a section is pressed on the page: the section and the place's field, as keys. Offer what can be added there. */
  readonly onSectionSlot?: (id: string, field: string) => void;
  /**
   * Called when the button on one of a section's pictures is pressed on the page, with the
   * section's id and the picture's field, as keys. Open the window the picture is chosen in.
   */
  readonly onSectionPicture?: (id: string, field: string) => void;
  /**
   * Called when the button on one of a section's links is pressed on the page, with the section's
   * id and the link's field, as keys. Open a window the link is changed in.
   */
  readonly onSectionLink?: (id: string, field: string) => void;
  /**
   * Called when a button on one item of a section's list is pressed on the page, with the section's
   * id, the list's field as keys, the item's place and what was asked. Whoever holds the list makes the change.
   */
  readonly onSectionItem?: (id: string, field: string, at: number, action: PageItemAction) => void;
  /** No border of its own, for a place that frames it already, such as a whole window. */
  readonly isBare?: boolean;
}

/**
 * A page of the site as it would look with what is in a form now, in a frame. The page is drawn
 * by the site itself, so it looks exactly as it will; nothing of it is drawn here.
 */
export function PagePreview({ label, address, draft, note, toolbar, action, emptyText, onSectionPress, shownSectionId, typable, onWords, tools, onSectionAction, onSectionMove, onSectionPicture, onSectionLink, onSectionItem, onSectionSwatch, onSectionSlot, onTextLink, onUndo, onRedo, onSave, isBare = false, width }: PagePreviewProps) {
  const name = `preview-${useId().replaceAll(':', '')}`;
  const form = useRef<HTMLFormElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const hasSent = useRef(false);
  const places = typable === undefined ? undefined : JSON.stringify(typable);
  const offered = tools === undefined ? undefined : JSON.stringify(tools);
  const latest = useRef({ onSectionPress, shownSectionId, onWords, places, offered, onSectionAction, onSectionMove, onSectionPicture, onSectionLink, onSectionItem, onSectionSwatch, onSectionSlot, onTextLink, onUndo, onRedo, onSave });
  useEffect(() => {
    latest.current = { onSectionPress, shownSectionId, onWords, places, offered, onSectionAction, onSectionMove, onSectionPicture, onSectionLink, onSectionItem, onSectionSwatch, onSectionSlot, onTextLink, onUndo, onRedo, onSave };
  });
  // When words were last typed on the page, and whether the page lacks a change made in the form.
  const typedAt = useRef(0);
  // When a button of the page's own tools was last pressed there.
  const pressedAt = useRef(0);
  const isBehind = useRef(false);

  // When a section was last asked to be shown, and when the draft last changed. A page drawn again
  // stays where the person left it, unless the change itself asked for a section: one just moved or added.
  const askedAt = useRef(0);
  const changedAt = useRef(0);
  const hasDrawn = useRef(false);

  // The first page is asked for at once. After that, a pause in the typing asks for the next.
  useEffect(() => {
    changedAt.current = Date.now();
    if (address === undefined) return;
    const send = () => {
      hasSent.current = true;
      isBehind.current = false;
      form.current?.submit();
    };
    if (!hasSent.current) {
      send();
      return;
    }
    // Words typed on the page are on the page already: drawing it again would take the caret away.
    if (Date.now() - typedAt.current < OWN && !isBehind.current) return;
    isBehind.current = true;
    // A button pressed on the page is one change, made: there is no typing to wait out.
    if (Date.now() - pressedAt.current < TOGETHER * 5) {
      pressedAt.current = 0;
      send();
      return;
    }
    const waiting = setTimeout(send, PAUSE);
    return () => clearTimeout(waiting);
  }, [address, draft]);

  // The page is drawn at the width of the screen it is tried on, whatever room the pane has: one
  // wider than the pane is shown smaller, whole, never as the narrower layout that would fit.
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ readonly width: number; readonly height: number } | null>(null);
  useEffect(() => {
    const element = stage.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => setRoom({ width: element.clientWidth, height: element.clientHeight });
    const watching = new ResizeObserver(measure);
    watching.observe(element);
    measure();
    return () => watching.disconnect();
  }, [address === undefined]);
  const wanted = pagePreviewWidths[width ?? 'full'];
  // A pane nearly as wide shows the page at its own width instead: a little narrower reads better than a little smaller.
  const fits = room === null || room.width <= 0 || room.width >= wanted * NEARLY;
  const scale = fits ? 1 : room.width / wanted;
  const isFitted = scale < 1;
  // A page takes itself to be shown at its own size, so it is told only when that is not so, or no longer so.
  const told = useRef(1);
  const zoom = (to: number) => {
    if (to === told.current) return;
    told.current = to;
    frame.current?.contentWindow?.postMessage({ source: SOURCE, type: 'zoom', scale: to }, window.location.origin);
  };
  const scaleNow = useRef(scale);
  useEffect(() => {
    scaleNow.current = scale;
    zoom(scale);
  }, [scale]);

  const show = (id: string | undefined, still = false) => {
    if (id !== undefined) frame.current?.contentWindow?.postMessage({ source: SOURCE, type: 'show', id, ...(still && { still }) }, window.location.origin);
  };

  const tell = (said: string | undefined) => {
    if (said !== undefined) frame.current?.contentWindow?.postMessage({ source: SOURCE, type: 'typable', places: JSON.parse(said) as unknown }, window.location.origin);
  };

  const offer = (said: string | undefined) => {
    if (said !== undefined) frame.current?.contentWindow?.postMessage({ source: SOURCE, type: 'tools', ...(JSON.parse(said) as object) }, window.location.origin);
  };

  // Only this site's own page, in this frame, is listened to.
  useEffect(() => {
    const hear = (event: MessageEvent<Said | null>) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const said = event.data;
      if (said?.source !== SOURCE) return;
      if (said.type === 'section' && typeof said.id === 'string') {
        if (typeof said.field === 'string') latest.current.onSectionPress?.(said.id, said.field, said.form === true);
        else latest.current.onSectionPress?.(said.id);
      }
      if (said.type === 'words' && typeof said.id === 'string' && typeof said.field === 'string' && typeof said.words === 'string') {
        typedAt.current = Date.now();
        latest.current.onWords?.(said.id, said.field, said.words);
      }
      if (said.type === 'act' || said.type === 'move' || said.type === 'item' || said.type === 'swatch' || said.type === 'undo' || said.type === 'redo') pressedAt.current = Date.now();
      if (said.type === 'act' && typeof said.id === 'string') {
        const action = ACTIONS.find((candidate) => candidate === said.action);
        if (action) latest.current.onSectionAction?.(said.id, action);
      }
      if (said.type === 'move' && typeof said.id === 'string' && (typeof said.before === 'string' || said.before === null)) {
        if (typeof said.into === 'string') latest.current.onSectionMove?.(said.id, said.before, said.into);
        else latest.current.onSectionMove?.(said.id, said.before);
      }
      if (said.type === 'slot' && typeof said.id === 'string' && typeof said.field === 'string') {
        latest.current.onSectionSlot?.(said.id, said.field);
      }
      if (said.type === 'picture' && typeof said.id === 'string' && typeof said.field === 'string') {
        latest.current.onSectionPicture?.(said.id, said.field);
      }
      if (said.type === 'link' && typeof said.id === 'string' && typeof said.field === 'string') {
        latest.current.onSectionLink?.(said.id, said.field);
      }
      if (said.type === 'item' && typeof said.id === 'string' && typeof said.field === 'string' && typeof said.at === 'number') {
        const action = ITEM_ACTIONS.find((candidate) => candidate === said.action);
        if (action) latest.current.onSectionItem?.(said.id, said.field, said.at, action);
      }
      if (said.type === 'swatch' && typeof said.id === 'string' && typeof said.field === 'string' && typeof said.value === 'string') {
        latest.current.onSectionSwatch?.(said.id, said.field, said.value);
      }
      if (said.type === 'linkAsk' && typeof said.href === 'string') {
        const page = frame.current?.contentWindow;
        const answer = (href: string | null) => page?.postMessage({ source: SOURCE, type: 'linkAnswer', href }, window.location.origin);
        if (latest.current.onTextLink) latest.current.onTextLink(said.href, answer);
        else answer(null);
      }
      if (said.type === 'undo' || said.type === 'redo') {
        // What the form holds next is not what the page shows, however lately words were typed there.
        typedAt.current = 0;
        if (said.type === 'undo') latest.current.onUndo?.();
        else latest.current.onRedo?.();
      }
      if (said.type === 'save') latest.current.onSave?.();
      if (said.type === 'ready') {
        told.current = 1;
        zoom(scaleNow.current);
        tell(latest.current.places);
        offer(latest.current.offered);
        // Outlined again, and brought into view only on the first page or when the change that drew this one asked for it.
        show(latest.current.shownSectionId, hasDrawn.current && Math.abs(askedAt.current - changedAt.current) > TOGETHER);
        hasDrawn.current = true;
        askedAt.current = 0;
      }
    };
    window.addEventListener('message', hear);
    return () => window.removeEventListener('message', hear);
  }, []);

  useEffect(() => {
    askedAt.current = Date.now();
    show(shownSectionId);
  }, [shownSectionId]);
  useEffect(() => tell(places), [places]);
  useEffect(() => offer(offered), [offered]);

  return (
    <div className={pagePreviewVariants({ isBare })}>
      {(note !== undefined || toolbar !== undefined || action !== undefined) && (
        <div className={pagePreviewBarClass}>
          {action ?? <span className={pagePreviewNoteClass}>{note}</span>}
          {toolbar}
        </div>
      )}
      <div ref={stage} className={pagePreviewStageVariants({ isFitted })}>
        {address === undefined ? (
          <p className={pagePreviewEmptyClass}>{emptyText}</p>
        ) : (
          <>
            {/* The preview is often inside a form of the screen's own, and a form may not hold another: this one lives at the end of the page. */}
            {createPortal(
              <form ref={form} method="post" action={address} target={name} hidden>
                <input type="hidden" name="draft" value={draft} readOnly />
              </form>,
              document.body,
            )}
            <iframe
              ref={frame}
              name={name}
              title={label}
              className={pagePreviewFrameVariants({ width, isFitted })}
              // Measured, so it cannot be a class: the page's true width, shown smaller to fit the pane.
              {...(isFitted && room !== null && { style: { width: `${wanted}px`, height: `${room.height / scale}px`, transform: `scale(${scale})` } })}
            />
          </>
        )}
      </div>
    </div>
  );
}
