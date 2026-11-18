import type { Cms } from '@velocity-astro/cms-core';
import { sharedConnection } from './connection.js';
import { DEFAULT_LOCALE, entriesOf, linkResolver } from './link.js';
import type { DrawnPage } from './page-head.js';
import { isPreview, withPreviewDraft } from './preview.js';

/** One link of a menu, ready to be written into a page. */
export interface MenuLink {
  readonly label: string;
  /** A path on this site, or a whole address when the link leaves it. */
  readonly href: string;
  /** True when the link leaves the site. */
  readonly external: boolean;
  /** What opens under the link, when it has anything: a large menu's columns. Left out otherwise. */
  readonly columns?: readonly MenuColumn[];
}

/** One column of the menu that opens under a link: a heading and its own links. */
export interface MenuColumn {
  readonly title: string;
  readonly links: readonly MenuLink[];
  /**
   * What the template is asked to fill the column with, when the item has a `show` choice: the
   * template's own word for it, such as `neighborhoods`. Left out, the column shows its links.
   */
  readonly show?: string;
}

export interface MenuOptions {
  /** The key of the content type that holds the site's menus, e.g. `navigation`. Its entry in the page's language is read. */
  readonly type: string;
  /** The key of the list field that is the menu, e.g. `header`. Each item is a group with a label and a link. */
  readonly field: string;
  /** The keys of an item's label and link fields. `label` and `link` unless told otherwise. */
  readonly labelKey?: string;
  readonly linkKey?: string;
  /**
   * The key of an item's list of columns: `columns` unless told otherwise. Each column is a group
   * with a `title`, a list of `links` (label and link, as above) and, if the template has columns
   * it fills itself, a `show` choice.
   */
  readonly columnsKey?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

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

  const resolve = linkResolver(cms, locale, preview);
  /** One item as a link, or nothing when it has no label or leads nowhere a visitor can go. */
  const linkOf = async (item: unknown): Promise<MenuLink | undefined> => {
    if (!isRecord(item)) return undefined;
    const label = item[options.labelKey ?? 'label'];
    const link = item[options.linkKey ?? 'link'];
    if (typeof label !== 'string' || label.trim() === '' || !isRecord(link)) return undefined;
    const target = await resolve(link);
    return target && { label, ...target };
  };
  const linksOf = async (list: unknown): Promise<MenuLink[]> => {
    const found: MenuLink[] = [];
    for (const item of Array.isArray(list) ? list : []) {
      const link = await linkOf(item);
      if (link) found.push(link);
    }
    return found;
  };

  const links: MenuLink[] = [];
  for (const item of items) {
    const link = await linkOf(item);
    if (!link || !isRecord(item)) continue;
    const columns: MenuColumn[] = [];
    const described = item[options.columnsKey ?? 'columns'];
    for (const column of Array.isArray(described) ? described : []) {
      if (!isRecord(column)) continue;
      const title = typeof column['title'] === 'string' ? column['title'] : '';
      const show = typeof column['show'] === 'string' && column['show'] !== 'links' ? column['show'] : undefined;
      const inside = await linksOf(column['links']);
      // A column with nothing in it, and nothing the template fills it with, is left out.
      if (inside.length > 0 || show !== undefined) columns.push({ title, links: inside, ...(show !== undefined && { show }) });
    }
    links.push(columns.length > 0 ? { ...link, columns } : link);
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
