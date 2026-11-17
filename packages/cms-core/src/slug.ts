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
