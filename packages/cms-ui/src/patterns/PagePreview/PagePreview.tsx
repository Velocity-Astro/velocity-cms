import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  pagePreviewBarClass,
  pagePreviewClass,
  pagePreviewEmptyClass,
  pagePreviewFrameVariants,
  pagePreviewNoteClass,
  pagePreviewStageClass,
  type PagePreviewVariants,
} from './PagePreview.variants.js';

/** How long the page waits after the last change before it is drawn again, in milliseconds. */
const PAUSE = 500;
/** The name both sides put on what they say to each other, so nothing else is taken for it. */
const SOURCE = 'velocity-cms';
/** How long after words were typed on the page a change of the draft is taken to be those words, in milliseconds. */
const OWN = 250;

interface Said {
  readonly source?: unknown;
  readonly type?: unknown;
  readonly id?: unknown;
  readonly field?: unknown;
  readonly words?: unknown;
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
  /** Shown in place of the page when there is no `address`. */
  readonly emptyText: string;
  /**
   * Called with a section's id when it is pressed on the page, and with the field that was
   * pressed, as keys (`title`, `items.0.text`), where the page marks its fields.
   */
  readonly onSectionPress?: (id: string, field?: string) => void;
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
}

/**
 * A page of the site as it would look with what is in a form now, in a frame. The page is drawn
 * by the site itself, so it looks exactly as it will; nothing of it is drawn here.
 */
export function PagePreview({ label, address, draft, note, toolbar, emptyText, onSectionPress, shownSectionId, typable, onWords, width }: PagePreviewProps) {
  const name = `preview-${useId().replaceAll(':', '')}`;
  const form = useRef<HTMLFormElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const hasSent = useRef(false);
  const places = typable === undefined ? undefined : JSON.stringify(typable);
  const latest = useRef({ onSectionPress, shownSectionId, onWords, places });
  useEffect(() => {
    latest.current = { onSectionPress, shownSectionId, onWords, places };
  });
  // When words were last typed on the page, and whether the page lacks a change made in the form.
  const typedAt = useRef(0);
  const isBehind = useRef(false);

  // The first page is asked for at once. After that, a pause in the typing asks for the next.
  useEffect(() => {
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
    const waiting = setTimeout(send, PAUSE);
    return () => clearTimeout(waiting);
  }, [address, draft]);

  const show = (id: string | undefined) => {
    if (id !== undefined) frame.current?.contentWindow?.postMessage({ source: SOURCE, type: 'show', id }, window.location.origin);
  };

  const tell = (said: string | undefined) => {
    if (said !== undefined) frame.current?.contentWindow?.postMessage({ source: SOURCE, type: 'typable', places: JSON.parse(said) as unknown }, window.location.origin);
  };

  // Only this site's own page, in this frame, is listened to.
  useEffect(() => {
    const hear = (event: MessageEvent<Said | null>) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const said = event.data;
      if (said?.source !== SOURCE) return;
      if (said.type === 'section' && typeof said.id === 'string') {
        if (typeof said.field === 'string') latest.current.onSectionPress?.(said.id, said.field);
        else latest.current.onSectionPress?.(said.id);
      }
      if (said.type === 'words' && typeof said.id === 'string' && typeof said.field === 'string' && typeof said.words === 'string') {
        typedAt.current = Date.now();
        latest.current.onWords?.(said.id, said.field, said.words);
      }
      if (said.type === 'ready') {
        tell(latest.current.places);
        show(latest.current.shownSectionId);
      }
    };
    window.addEventListener('message', hear);
    return () => window.removeEventListener('message', hear);
  }, []);

  useEffect(() => show(shownSectionId), [shownSectionId]);
  useEffect(() => tell(places), [places]);

  return (
    <div className={pagePreviewClass}>
      {(note !== undefined || toolbar !== undefined) && (
        <div className={pagePreviewBarClass}>
          <span className={pagePreviewNoteClass}>{note}</span>
          {toolbar}
        </div>
      )}
      <div className={pagePreviewStageClass}>
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
            <iframe ref={frame} name={name} title={label} className={pagePreviewFrameVariants({ width })} />
          </>
        )}
      </div>
    </div>
  );
}
