import { pageAddress, type Cms, type ContentTypeDef, type PublicEntry } from '@velocity-astro/cms-core';
import { sharedConnection, SITE } from './connection.js';
import { pageAt, type DrawnPage } from './page-head.js';

/** The language of the pages at a type's `urlPattern`. */
const DEFAULT_LOCALE = 'en';
const PAGE_SIZE = 500;

/** An entry found by the address of its own page. */
export interface EntryPage {
  /** The key of its content type, e.g. `pages`. */
  readonly type: string;
  readonly locale: string;
  /** The entry as the site reads it: values by field key, and each section of a page with its block's key. */
  readonly entry: PublicEntry;
}

export interface EntryPageOptions {
  /** The content types to look in, by key. Left out, every type with a page of its own. */
  readonly types?: readonly string[];
}

const among = (types: readonly ContentTypeDef[], keys: readonly string[] | undefined) => (keys ? types.filter((type) => keys.includes(type.key)) : types);

/**
 * The entry whose own page is at the address being drawn, or nothing when there is none. It is
 * how one route draws every page people make in the editor:
 *
 * ```astro
 * const page = await entryPage(Astro, { types: ['pages'] });
 * if (!page) return new Response(null, { status: 404 });
 * ```
 *
 * Visitors get the published version; a preview gets the one being worked on. A fault is thrown,
 * not answered as "no page": a page that exists must never look like one that does not.
 */
export async function entryPage(page: DrawnPage, options: EntryPageOptions = {}): Promise<EntryPage | undefined> {
  const { cms } = await sharedConnection({});
  return entryPageAt(cms, page.url.pathname, options.types);
}

/** `entryPage` for a CMS already at hand. */
export async function entryPageAt(cms: Cms, path: string, types?: readonly string[]): Promise<EntryPage | undefined> {
  const found = await pageAt(cms, among(await cms.schema.list(), types), path);
  return found.entry && found.type && found.locale !== undefined ? { type: found.type.key, locale: found.locale, entry: found.entry } : undefined;
}

/**
 * The address of every published page of the content types named, for the sitemap, search and
 * share images. Pages made in the editor have no file the site could have listed them from.
 */
export async function entryPageAddresses(types: readonly string[]): Promise<string[]> {
  if (types.length === 0) return [];
  const { cms } = await sharedConnection({});
  return publishedAddresses(cms, types);
}

/** `entryPageAddresses` for a CMS already at hand. */
export async function publishedAddresses(cms: Cms, types: readonly string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const type of among(await cms.schema.list(), types)) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await cms.content.find(SITE, { typeId: type.id, status: 'published', limit: PAGE_SIZE, offset });
      for (const entry of page.items) {
        const address = entry.published && pageAddress(type, { locale: entry.locale, slug: entry.published.slug, data: entry.published.data }, DEFAULT_LOCALE);
        if (address) paths.push(address);
      }
      if (offset + page.items.length >= page.total || page.items.length === 0) break;
    }
  }
  return paths;
}
