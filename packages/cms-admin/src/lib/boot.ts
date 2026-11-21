/**
 * The mark the page shows before the editor's script has arrived (`#cms-boot`, written into the
 * page the site serves) stays over the editor until its first real screen is drawn, then fades.
 * So the mark is one animation from the first byte of the page to the first screen, and never
 * starts again half way. A screen still finding out what to show (`LoadingMark`) holds it up.
 *
 * Where the page has no such mark (a test, the preview), all of this does nothing.
 */

const BOOT_ID = 'cms-boot';
/** How long the mark takes to fade, in milliseconds: the page's own style says the same. */
const FADE_MS = 300;

/** The first draw counts as one hold, given back once it is done (`bootDrawn`). */
let holds = 1;
let isDrawn = false;

function endIfFree(): void {
  if (holds > 0 || typeof document === 'undefined') return;
  const mark = document.getElementById(BOOT_ID);
  if (mark === null || mark.dataset['ending'] === 'true') return;
  mark.dataset['ending'] = 'true';
  setTimeout(() => mark.remove(), FADE_MS);
}

/** Keeps the page's mark up while a screen is still finding out what to show. Returns how to let go. */
export function holdBoot(): () => void {
  holds += 1;
  let isLetGo = false;
  return () => {
    if (isLetGo) return;
    isLetGo = true;
    holds -= 1;
    // A screen that follows at once (the next one taking over) holds it before this looks.
    setTimeout(endIfFree, 0);
  };
}

/** Says the editor has drawn for the first time: the mark goes once nothing else holds it. */
export function bootDrawn(): void {
  if (isDrawn) return;
  isDrawn = true;
  holds -= 1;
  setTimeout(endIfFree, 0);
}
