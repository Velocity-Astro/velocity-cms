/** A slug made from a title: "Café on 5th St." becomes `cafe-on-5th-st`. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
