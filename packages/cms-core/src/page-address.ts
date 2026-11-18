import { liveFields, type ContentTypeDef, type EntryData } from './model.js';

type Pages = Pick<ContentTypeDef, 'urlPattern' | 'localizedUrlPatterns' | 'fields'>;

/** One version of an entry: the one being worked on, or the published one. */
export interface AddressedVersion {
  readonly locale: string;
  readonly slug: string;
  readonly data: EntryData;
}

/** The pattern a type's pages follow in one language, if it has pages there. */
export const urlPatternFor = (type: Pick<ContentTypeDef, 'urlPattern' | 'localizedUrlPatterns'>, locale: string, defaultLocale: string): string | undefined =>
  locale === defaultLocale ? type.urlPattern : type.localizedUrlPatterns?.[locale];

/**
 * Where an entry's own page is on the site, as a path that ends in a slash: `/listings/oak-lane/`.
 *
 * A pattern names what goes in the address in brackets: `[slug]` is the entry's slug, and any
 * other name is one of the type's text fields by key, as in `/listings/[path]`. `null` when the
 * type has no page in that language, or the entry does not yet have what the pattern names.
 */
export function pageAddress(type: Pages, entry: AddressedVersion, defaultLocale: string): string | null {
  const pattern = urlPatternFor(type, entry.locale, defaultLocale);
  if (pattern === undefined) return null;
  let isComplete = true;
  const path = pattern.replace(/\[([^\]]+)\]/g, (_, name: string) => {
    const field = name === 'slug' ? undefined : liveFields(type.fields).find((candidate) => candidate.key === name);
    const value = name === 'slug' ? entry.slug : field ? entry.data[field.id] : undefined;
    // What goes in an address is one plain segment: no slashes, nothing a browser would read as more.
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(value)) {
      isComplete = false;
      return '';
    }
    return value;
  });
  return isComplete ? `${path.replace(/\/+$/, '')}/` : null;
}
