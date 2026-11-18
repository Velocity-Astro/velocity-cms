import { HOME_SLUG, isSlug, isSlugPath, type Cms, type ContentTypeDef, type PageHead, type PageInfo } from '@velocity-astro/cms-core';
import { sharedConnection, SITE } from './connection.js';
import { isPreview, withPreviewDraft } from './preview.js';

/** The language of the pages at a type's `urlPattern`. */
const DEFAULT_LOCALE = 'en';

/** What `pageHead` needs of the page being drawn: `Astro` has both. */
export interface DrawnPage {
  readonly url: URL;
  readonly currentLocale?: string | undefined;
}

/** A type's address pattern as something an address can be tried against: the slug, when it fits. */
function slugIn(pattern: string, path: string): string | null {
  // Only a pattern whose one name is the slug says which entry a page is for. `[...slug]` is a
  // slug that may have several parts, so pages can sit under other pages.
  const name = pattern.includes('[...slug]') ? '[...slug]' : '[slug]';
  if (pattern.replace(name, '').includes('[') || !pattern.includes(name)) return null;
  const trim = (text: string) => text.replace(/\/+$/, '');
  const [before = '', after = ''] = trim(pattern).split(name);
  const address = trim(path);
  // The top of a [...slug] pattern is the page called index, and that page has no other address.
  if (name === '[...slug]' && address === trim(trim(before) + after)) return HOME_SLUG;
  if (!address.startsWith(before) || !address.endsWith(after) || address.length <= before.length + after.length) return null;
  const slug = address.slice(before.length, address.length - after.length);
  if (name === '[slug]') return isSlug(slug) ? slug : null;
  return isSlugPath(slug) && slug !== HOME_SLUG ? slug : null;
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
      if (entry) return { type, locale, entry: cms.content.toPublic(type, withPreviewDraft(entry), version) };
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
