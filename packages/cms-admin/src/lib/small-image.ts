import type { SiteImage } from '@velocity-astro/cms-core';

/**
 * Where a list of images loads one from: the small copy when the site makes one, so a grid
 * of forty photos is not forty full-size downloads, and the image itself otherwise.
 */
export const smallOf = (image: SiteImage): string => image.thumbnail ?? image.url;
