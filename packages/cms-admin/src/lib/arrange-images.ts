import type { SiteImage } from '@velocity-astro/cms-core';

/** Where an image is from: uploaded in the editor, or one of the site's own files. */
export const IMAGE_SOURCES = ['all', 'uploaded', 'site'] as const;
export type ImageSource = (typeof IMAGE_SOURCES)[number];

/** The kinds of file an image can be, by the ending of its address. */
export const IMAGE_KINDS = ['all', 'jpeg', 'png', 'webp', 'svg', 'gif', 'avif'] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

export const IMAGE_SORTS = ['newest', 'oldest', 'name', 'largest'] as const;
export type ImageSort = (typeof IMAGE_SORTS)[number];

export interface ImageArrangement {
  readonly query: string;
  readonly source: ImageSource;
  readonly kind: ImageKind;
  readonly sort: ImageSort;
}

/** What a library shows before anyone chooses: everything, the latest upload first. */
export const NEWEST_FIRST: ImageArrangement = { query: '', source: 'all', kind: 'all', sort: 'newest' };

/** The kind of file an image is, from the ending of its address, or `null` when it has none we know. */
export function kindOf(image: SiteImage): Exclude<ImageKind, 'all'> | null {
  const ending = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(image.url)?.[1]?.toLowerCase();
  if (ending === 'jpg' || ending === 'jpeg') return 'jpeg';
  return ending === 'png' || ending === 'webp' || ending === 'svg' || ending === 'gif' || ending === 'avif' ? ending : null;
}

const byName = (a: SiteImage, b: SiteImage) => a.name.localeCompare(b.name);
const uploadedAt = (image: SiteImage) => (image.uploadedAt === undefined ? null : Date.parse(image.uploadedAt));

/**
 * The images a library shows, as the person asked: found by name, from where they chose, of the
 * kind they chose, in the order they chose. By date, uploads come first in that order and the
 * site's own images, which have no date, after them by name. By size, an image whose size is
 * not known goes last.
 */
export function arrangeImages(images: readonly SiteImage[], { query, source, kind, sort }: ImageArrangement): SiteImage[] {
  const words = query.trim().toLowerCase();
  const shown = images.filter(
    (image) =>
      (words === '' || image.name.toLowerCase().includes(words)) &&
      (source === 'all' || (source === 'uploaded') === (image.uploadedAt !== undefined)) &&
      (kind === 'all' || kindOf(image) === kind),
  );
  return shown.sort((a, b) => {
    if (sort === 'name') return byName(a, b);
    if (sort === 'largest') return (b.size ?? -1) - (a.size ?? -1) || byName(a, b);
    const [at, bt] = [uploadedAt(a), uploadedAt(b)];
    if (at === null || bt === null) return at === bt ? byName(a, b) : at === null ? 1 : -1;
    return (sort === 'newest' ? bt - at : at - bt) || byName(a, b);
  });
}
