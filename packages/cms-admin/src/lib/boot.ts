/**
 * The mark the page shows before the editor's script has arrived (`#cms-boot`, written into the
 * page the site serves) stays over the editor until its first screen is ready, then fades. So the
 * editor opens with one moment of waiting, from the first byte of the page to a finished screen,
 * and never with the mark and then a screen of grey shapes.
 *
 * Two kinds of thing hold it up. The frame, while it learns who is signed in (`LoadingMark`),
 * holds it for as long as that takes: there is nothing else to show. A screen whose content is on
 * its way (`LoadingState`) holds it too while the editor is opening, until the content arrives or
 * fails (a failure shows at once, as the screen's own error). Only a request that never answers is
 * cut short: after `SCREEN_WAIT_MS` the screen is shown with its grey shapes, so a stalled
 * connection leaves the person in the editor rather than before a mark for ever. Once the mark has
 * gone, holding does nothing, and screens show their shapes as usual.
 *
 * Where the page has no such mark (a test, the preview), all of this does nothing.
 */

const BOOT_ID = 'cms-boot';
/** How long the mark takes to fade, in milliseconds: the page's own style says the same. */
const FADE_MS = 300;
/** How long a screen waiting for its content may keep the mark up, once the frame is ready: a safety net for a request that never answers. */
export const SCREEN_WAIT_MS = 10_000;

/** The first draw counts as a hold of the frame, given back once it is done (`bootDrawn`). */
let frame = 1;
let screens = 0;
let isDrawn = false;
let hasEnded = false;
let screenLimit: ReturnType<typeof setTimeout> | undefined;

function end(): void {
  hasEnded = true;
  if (screenLimit !== undefined) clearTimeout(screenLimit);
  if (typeof document === 'undefined') return;
  const mark = document.getElementById(BOOT_ID);
  if (mark === null) return;
  mark.dataset['ending'] = 'true';
  setTimeout(() => mark.remove(), FADE_MS);
}

function look(): void {
  if (hasEnded || frame > 0) return;
  if (screens === 0) return end();
  screenLimit ??= setTimeout(() => {
    screenLimit = undefined;
    if (frame === 0) end();
  }, SCREEN_WAIT_MS);
}

function hold(kind: 'frame' | 'screen'): () => void {
  if (hasEnded) return () => {};
  if (kind === 'frame') frame += 1;
  else screens += 1;
  let isLetGo = false;
  return () => {
    if (isLetGo) return;
    isLetGo = true;
    if (kind === 'frame') frame -= 1;
    else screens -= 1;
    // What follows at once (the next screen, or its content's shapes) holds it before this looks.
    setTimeout(look, 0);
  };
}

/** Keeps the page's mark up while the frame learns who is signed in. Returns how to let go. */
export function holdBoot(): () => void {
  return hold('frame');
}

/** Keeps the page's mark up while a screen's content is on its way, if the editor is still opening. */
export function holdBootForScreen(): () => void {
  return hold('screen');
}

/** Says the editor has drawn for the first time: the mark goes once nothing else holds it. */
export function bootDrawn(): void {
  if (isDrawn) return;
  isDrawn = true;
  frame -= 1;
  setTimeout(look, 0);
}
