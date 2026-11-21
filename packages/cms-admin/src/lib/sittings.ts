import type { Revision } from '@velocity-astro/cms-core';

/** Saves by one person that follow each other this closely are one sitting, in milliseconds. */
export const SITTING_PAUSE_MS = 10 * 60_000;

/** Saves made in one go: the latest, which stands for them, and those before it, the latest first. */
export interface Sitting {
  readonly latest: Revision;
  readonly earlier: readonly Revision[];
}

/**
 * Folds a history, the latest first, into sittings. A draft saves itself every few seconds of
 * work, and a list of every one of those hides the saves that matter. Saves are one sitting when
 * one person made them, none waited long after the one before, and none changed whether the entry
 * is on the site. The save visitors see (`onSite`) always stands by itself.
 */
export function sittings(revisions: readonly Revision[], onSite?: number): Sitting[] {
  const folded: { latest: Revision; earlier: Revision[] }[] = [];
  let after: Revision | undefined;
  for (const revision of revisions) {
    const open = folded.at(-1);
    const joins =
      open !== undefined &&
      after !== undefined &&
      after.actorId === revision.actorId &&
      after.status === revision.status &&
      after.revision !== onSite &&
      revision.revision !== onSite &&
      Date.parse(after.createdAt) - Date.parse(revision.createdAt) < SITTING_PAUSE_MS;
    if (joins) open.earlier.push(revision);
    else folded.push({ latest: revision, earlier: [] });
    after = revision;
  }
  return folded;
}
