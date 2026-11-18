const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The longest slug an entry may have. Long enough for any title, short enough for any address bar. */
export const MAX_SLUG_LENGTH = 200;

/**
 * Whether text can be an entry's slug: lowercase letters and numbers, in words joined by single
 * hyphens. A slug becomes part of a page's address, so nothing that means something in an
 * address (a slash, a dot, a space, a question mark) is allowed.
 */
export function isSlug(text: string): boolean {
  return text.length <= MAX_SLUG_LENGTH && SLUG.test(text);
}

/** How many parts an address made of slugs may have: `/services/roofing/tile` is three. */
export const MAX_SLUG_PARTS = 5;

/**
 * Whether text can be the slug of an entry whose address has several parts: slugs joined by
 * single slashes, such as `services/roofing`. One slug alone is such a path too.
 */
export function isSlugPath(text: string): boolean {
  const parts = text.split('/');
  return text.length <= MAX_SLUG_LENGTH && parts.length <= MAX_SLUG_PARTS && parts.every((part) => SLUG.test(part));
}

/** The name a pattern uses for a slug that may have several parts: `/[...slug]`. */
export const SLUG_PATH_NAME = '...slug';

/** Whether a content type's entries may have a slug of several parts: one of its address patterns says `[...slug]`. */
export function takesSlugPath(type: { readonly urlPattern?: string | undefined; readonly localizedUrlPatterns?: Readonly<Record<string, string>> | undefined }): boolean {
  return [type.urlPattern, ...Object.values(type.localizedUrlPatterns ?? {})].some((pattern) => pattern?.includes(`[${SLUG_PATH_NAME}]`) === true);
}
