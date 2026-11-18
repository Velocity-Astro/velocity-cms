import type { Cms, ContentTypeDef, PageHead, PageInfo } from '@velocity/cms-core';
import { sharedConnection, SITE } from './connection.js';
import { isPreview } from './preview.js';

/** The language of the pages at a type's `urlPattern`. */
const DEFAULT_LOCALE = 'en';

/** What `pageHead` needs of the page being drawn: `Astro` has both. */
export interface DrawnPage {
  readonly url: URL;
  readonly currentLocale?: string | undefined;
}

/** A type's address pattern as something an address can be tried against: the slug, when it fits. */
function slugIn(pattern: string, path: string): string | null {
  // Only a pattern whose one name is the slug says which entry a page is for.
  if (pattern.replace('[slug]', '').includes('[') || !pattern.includes('[slug]')) return null;
  const trim = (text: string) => text.replace(/\/+$/, '');
  const [before = '', after = ''] = trim(pattern).split('[slug]');
  const address = trim(path);
  if (!address.startsWith(before) || !address.endsWith(after) || address.length <= before.length + after.length) return null;
  const slug = address.slice(before.length, address.length - after.length);
  return slug.includes('/') ? null : slug;
}

/** The entry whose own page is at `path`, if any: the published one, or in a preview the one being worked on. */
export async function pageAt(cms: Cms, types: readonly ContentTypeDef[], path: string): Promise<Pick<PageInfo, 'entry' | 'type'> & { locale?: string }> {
  for (const type of types) {
    const patterns: [string, string | undefined][] = [[DEFAULT_LOCALE, type.urlPattern], ...Object.entries(type.localizedUrlPatterns ?? {})];
    for (const [locale, pattern] of patterns) {
      const slug = pattern === undefined ? null : slugIn(pattern, path);
      if (slug === null) continue;
      const version = isPreview() ? 'working' : 'published';
      const entry = await cms.content.findBySlug(SITE, { typeId: type.id, locale, slug, version });
      if (entry) return { type, locale, entry: cms.content.toPublic(type, entry, version) };
    }
  }
  return {};
}

/**
 * What the page being drawn should say about itself to search engines, after the site's plugins
 * have had their say. A template calls it where it writes its `<title>` and description:
 *
 * ```astro
 * const head = await pageHead(Astro, { title, description, noindex });
 * ```
 *
 * It gives back what it was given when no plugin changes anything, and also when anything goes
 * wrong: a page is never lost over its description.
 */
export async function pageHead(page: DrawnPage, head: PageHead): Promise<PageHead> {
  try {
    const { cms } = await sharedConnection({});
    const path = page.url.pathname;
    const found = await pageAt(cms, await cms.schema.list(), path);
    const { locale = page.currentLocale ?? DEFAULT_LOCALE, ...entry } = found;
    return await cms.pages.run({ path, locale, ...entry }, head);
  } catch (error) {
    console.error('[velocity-cms] The page head could not be worked out, so the template\'s own is used.', error);
    return head;
  }
}
