import { isSafeLink, pageAddress, type Cms, type ContentTypeDef, type Entry } from '@velocity-astro/cms-core';
import { sharedConnection, SITE } from './connection.js';
import type { DrawnPage } from './page-head.js';
import { isPreview } from './preview.js';

/** The language of the pages at a type's `urlPattern`. */
export const DEFAULT_LOCALE = 'en';
const PAGE_SIZE = 500;

/** Where a link leads, ready to be written into a page. */
export interface LinkTarget {
  readonly href: string;
  /** True when the link leaves the site. */
  readonly external: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const leaves = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href);

/** Every entry of a type. */
export async function entriesOf(cms: Cms, type: ContentTypeDef): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await cms.content.find(SITE, { typeId: type.id, limit: PAGE_SIZE, offset });
    entries.push(...page.items);
    if (offset + page.items.length >= page.total || page.items.length === 0) break;
  }
  return entries;
}

/**
 * Turns the values of `link` fields into addresses for pages in one language. A type's entries
 * are read once however many links point there, so make one for a page and use it for every link.
 * `preview` follows the versions being worked on.
 */
export function linkResolver(cms: Cms, locale: string, preview = false): (link: unknown) => Promise<LinkTarget | undefined> {
  let types: Promise<ContentTypeDef[]> | undefined;
  const read = new Map<string, Promise<Entry[]>>();
  return async (link) => {
    // An address typed where a link is now chosen, kept from before, still leads where it did.
    if (typeof link === 'string') return link.trim() !== '' && isSafeLink(link.trim()) ? { href: link.trim(), external: leaves(link.trim()) } : undefined;
    if (!isRecord(link)) return undefined;
    if (link['kind'] === 'address' && typeof link['href'] === 'string') {
      return isSafeLink(link['href']) ? { href: link['href'], external: leaves(link['href']) } : undefined;
    }
    if (link['kind'] !== 'entry') return undefined;
    // A link to an entry goes to wherever that entry's page is now, in this language if it has
    // one. An entry that is gone, or not published, has no page: there is no link.
    types ??= cms.schema.list();
    const type = (await types).find((candidate) => candidate.key === link['type']);
    if (!type) return undefined;
    if (!read.has(type.id)) read.set(type.id, entriesOf(cms, type));
    const versions = ((await read.get(type.id)) ?? []).filter((entry) => entry.translationGroup === link['entry']);
    const target = versions.find((entry) => entry.locale === locale) ?? versions.find((entry) => entry.locale === DEFAULT_LOCALE);
    const shown = target && (preview ? { slug: target.slug, data: target.data } : target.published);
    const href = target && shown ? pageAddress(type, { locale: target.locale, slug: shown.slug, data: shown.data }, DEFAULT_LOCALE) : null;
    return href === null ? undefined : { href, external: false };
  };
}

/**
 * Where a `link` field's value leads, for the page being drawn:
 *
 * ```astro
 * const button = await linkTo(Astro, buttonLink);
 * {button && <a href={button.href}>{buttonLabel}</a>}
 * ```
 *
 * A link to an entry is that entry's address today, in the page's language. It answers with
 * nothing when the entry is not published, the address is not one a site may link to, or
 * anything goes wrong: a page is never lost over a button.
 */
export async function linkTo(page: DrawnPage, link: unknown): Promise<LinkTarget | undefined> {
  try {
    const { cms } = await sharedConnection({});
    return await linkResolver(cms, page.currentLocale ?? DEFAULT_LOCALE, isPreview())(link);
  } catch (error) {
    console.error('[velocity-cms] A link could not be worked out, so it is left off the page.', error);
    return undefined;
  }
}
