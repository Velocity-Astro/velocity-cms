import { pageAddress, type Cms, type ContentTypeDef, type Entry } from '@velocity/cms-core';
import { sharedConnection, SITE } from './connection.js';
import type { DrawnPage } from './page-head.js';
import { isPreview, withPreviewDraft } from './preview.js';

/** The language of the pages at a type's `urlPattern`. */
const DEFAULT_LOCALE = 'en';
const PAGE_SIZE = 500;

/** One link of a menu, ready to be written into a page. */
export interface MenuLink {
  readonly label: string;
  /** A path on this site, or a whole address when the link leaves it. */
  readonly href: string;
  /** True when the link leaves the site. */
  readonly external: boolean;
}

export interface MenuOptions {
  /** The key of the content type that holds the site's menus, e.g. `navigation`. Its entry in the page's language is read. */
  readonly type: string;
  /** The key of the list field that is the menu, e.g. `header`. Each item is a group with a label and a link. */
  readonly field: string;
  /** The keys of an item's label and link fields. `label` and `link` unless told otherwise. */
  readonly labelKey?: string;
  readonly linkKey?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every entry of a type, read once for a menu however many of its links point there. */
async function entriesOf(cms: Cms, type: ContentTypeDef): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await cms.content.find(SITE, { typeId: type.id, limit: PAGE_SIZE, offset });
    entries.push(...page.items);
    if (offset + page.items.length >= page.total || page.items.length === 0) break;
  }
  return entries;
}

/** `menuLinks` for a CMS already at hand. `preview` reads the versions being worked on. */
export async function menuLinksFrom(cms: Cms, locale: string, options: MenuOptions, preview = false): Promise<MenuLink[]> {
  const types = await cms.schema.list();
  const holder = types.find((type) => type.key === options.type);
  if (!holder) return [];
  // A language with no menu of its own has no links here, so the template shows its own, in that
  // language. Another language's menu would put the wrong words on every page.
  const menu = (await entriesOf(cms, holder)).find((entry) => entry.locale === locale && (preview || entry.published !== undefined));
  if (!menu) return [];
  const items = cms.content.toPublic(holder, withPreviewDraft(menu), preview ? 'working' : 'published').data[options.field];
  if (!Array.isArray(items)) return [];

  const read = new Map<string, Promise<Entry[]>>();
  const links: MenuLink[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const label = item[options.labelKey ?? 'label'];
    const link = item[options.linkKey ?? 'link'];
    if (typeof label !== 'string' || label.trim() === '' || !isRecord(link)) continue;
    if (link['kind'] === 'address' && typeof link['href'] === 'string') {
      links.push({ label, href: link['href'], external: /^[a-z][a-z0-9+.-]*:/i.test(link['href']) });
      continue;
    }
    // A link to an entry goes to wherever that entry's page is now, in this language if it has
    // one. An entry that is gone, or not published, has no page: the link is left out.
    const type = types.find((candidate) => candidate.key === link['type']);
    if (link['kind'] !== 'entry' || !type) continue;
    if (!read.has(type.id)) read.set(type.id, entriesOf(cms, type));
    const versions = ((await read.get(type.id)) ?? []).filter((entry) => entry.translationGroup === link['entry']);
    const target = versions.find((entry) => entry.locale === locale) ?? versions.find((entry) => entry.locale === DEFAULT_LOCALE);
    const shown = target && (preview ? { slug: target.slug, data: target.data } : target.published);
    const href = target && shown ? pageAddress(type, { locale: target.locale, slug: shown.slug, data: shown.data }, DEFAULT_LOCALE) : null;
    if (href !== null) links.push({ label, href, external: false });
  }
  return links;
}

/**
 * A menu people edit in the CMS, as links ready for the page being drawn:
 *
 * ```astro
 * const links = await menuLinks(Astro, { type: 'navigation', field: 'header' });
 * ```
 *
 * It answers with no links when there is no menu in the page's language yet, and also when anything goes wrong: a page
 * is never lost over its menu, and the template shows its own links instead.
 */
export async function menuLinks(page: DrawnPage, options: MenuOptions): Promise<MenuLink[]> {
  try {
    const { cms } = await sharedConnection({});
    return await menuLinksFrom(cms, page.currentLocale ?? DEFAULT_LOCALE, options, isPreview());
  } catch (error) {
    console.error('[velocity-cms] The menu could not be read, so the template\'s own links are used.', error);
    return [];
  }
}
