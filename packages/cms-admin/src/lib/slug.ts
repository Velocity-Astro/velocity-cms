/** What a slug must look like: lowercase words and numbers joined by single hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSlug(text: string): boolean {
  return SLUG.test(text);
}

/** A slug made from a title: "Café on 5th St." becomes `cafe-on-5th-st`. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
