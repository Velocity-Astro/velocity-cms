import { useEffect, useId, useRef, type ReactNode } from 'react';
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

interface Said {
  readonly source?: unknown;
  readonly type?: unknown;
  readonly id?: unknown;
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
  /** Called with a section's id when it is pressed on the page. */
  readonly onSectionPress?: (id: string) => void;
  /** The section the page should have in view. */
  readonly shownSectionId?: string;
}

/**
 * A page of the site as it would look with what is in a form now, in a frame. The page is drawn
 * by the site itself, so it looks exactly as it will; nothing of it is drawn here.
 */
export function PagePreview({ label, address, draft, note, toolbar, emptyText, onSectionPress, shownSectionId, width }: PagePreviewProps) {
  const name = `preview-${useId().replaceAll(':', '')}`;
  const form = useRef<HTMLFormElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const hasSent = useRef(false);
  const latest = useRef({ onSectionPress, shownSectionId });
  useEffect(() => {
    latest.current = { onSectionPress, shownSectionId };
  });

  // The first page is asked for at once. After that, a pause in the typing asks for the next.
  useEffect(() => {
    if (address === undefined) return;
    const send = () => {
      hasSent.current = true;
      form.current?.submit();
    };
    if (!hasSent.current) {
      send();
      return;
    }
    const waiting = setTimeout(send, PAUSE);
    return () => clearTimeout(waiting);
  }, [address, draft]);

  const show = (id: string | undefined) => {
    if (id !== undefined) frame.current?.contentWindow?.postMessage({ source: SOURCE, type: 'show', id }, window.location.origin);
  };

  // Only this site's own page, in this frame, is listened to.
  useEffect(() => {
    const hear = (event: MessageEvent<Said | null>) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const said = event.data;
      if (said?.source !== SOURCE) return;
      if (said.type === 'section' && typeof said.id === 'string') latest.current.onSectionPress?.(said.id);
      if (said.type === 'ready') show(latest.current.shownSectionId);
    };
    window.addEventListener('message', hear);
    return () => window.removeEventListener('message', hear);
  }, []);

  useEffect(() => show(shownSectionId), [shownSectionId]);

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
            <form ref={form} method="post" action={address} target={name} hidden>
              <input type="hidden" name="draft" value={draft} readOnly />
            </form>
            <iframe ref={frame} name={name} title={label} className={pagePreviewFrameVariants({ width })} />
          </>
        )}
      </div>
    </div>
  );
}
