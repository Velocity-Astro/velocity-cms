import type { LiveLoader } from 'astro/loaders';
import type { ContentTypeDef, Entry } from '@velocity/cms-core';
import { sharedConnection, SITE, type ConnectionOptions } from './connection.js';

export interface CmsLiveLoaderOptions extends ConnectionOptions {
  /** The key of the content type to load, e.g. `listings`. */
  readonly type: string;
}

export interface CmsEntryFilter {
  /** `<locale>/<slug>`, the same id the build-time loader gives an entry. */
  readonly id: string;
}

export interface CmsCollectionFilter {
  readonly locale?: string;
}

/** The cache tag every page showing entries of a type carries. Publishing clears it. */
export const typeTag = (typeKey: string): string => `cms:${typeKey}`;

/** The cache tag for one entry, for pages that show only that entry. */
export const entryTag = (typeKey: string, id: string): string => `cms:${typeKey}:${id}`;

const PAGE_SIZE = 500;

let contentVersion = 0;

/**
 * A number that goes up every time published content changes. Anything a site derives from live
 * content and keeps in memory can be stored beside this number and thrown away when it moves.
 */
export const liveContentVersion = (): number => contentVersion;

/** Tells this server that published content changed. Called on publish, before clearing the page cache. */
export function invalidateLiveContent(): void {
  contentVersion++;
}

/**
 * A live loader: pages rendered on demand read published entries straight from the CMS, so a
 * change shows as soon as the page's cache is cleared instead of after a rebuild.
 *
 * Each entry comes back with cache tags. Pass an entry to `Astro.cache.set()` and the page is
 * cached under those tags; clearing `typeTag('listings')` on publish refreshes every such page.
 *
 * ```ts
 * // src/live.config.ts
 * export const collections = {
 *   listings: defineLiveCollection({ loader: cmsLiveLoader({ type: 'listings' }), schema }),
 * };
 * ```
 */
export function cmsLiveLoader(
  options: CmsLiveLoaderOptions,
): LiveLoader<Record<string, unknown>, CmsEntryFilter, CmsCollectionFilter> {
  const tag = typeTag(options.type);

  const toLive = (cms: Awaited<ReturnType<typeof sharedConnection>>['cms'], type: ContentTypeDef, entry: Entry) => {
    const id = `${entry.locale}/${entry.slug}`;
    return {
      id,
      data: { ...cms.content.toPublic(type, entry).data, slug: entry.slug, locale: entry.locale },
      cacheHint: { tags: [tag, entryTag(options.type, id)], lastModified: new Date(entry.updatedAt) },
    };
  };

  return {
    name: 'velocity-cms-live',

    async loadCollection({ filter }) {
      try {
        const { cms } = await sharedConnection(options);
        const type = await cms.schema.getByKey(options.type);
        const entries = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const page = await cms.content.find(SITE, {
            typeId: type.id,
            status: 'published',
            ...(filter?.locale !== undefined && { locale: filter.locale }),
            limit: PAGE_SIZE,
            offset,
          });
          entries.push(...page.items.map((entry) => toLive(cms, type, entry)));
          if (offset + page.items.length >= page.total || page.items.length === 0) break;
        }
        return { entries, cacheHint: { tags: [tag] } };
      } catch (error) {
        return { error: error instanceof Error ? error : new Error(String(error)) };
      }
    },

    async loadEntry({ filter }) {
      try {
        const { cms } = await sharedConnection(options);
        const type = await cms.schema.getByKey(options.type);
        const separator = filter.id.indexOf('/');
        const locale = filter.id.slice(0, separator);
        const slug = filter.id.slice(separator + 1);
        // Prototype: scans the locale. The repository needs a lookup by slug before this ships.
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const page = await cms.content.find(SITE, { typeId: type.id, status: 'published', locale, limit: PAGE_SIZE, offset });
          const match = page.items.find((entry) => entry.slug === slug);
          if (match) return toLive(cms, type, match);
          if (offset + page.items.length >= page.total || page.items.length === 0) return undefined;
        }
      } catch (error) {
        return { error: error instanceof Error ? error : new Error(String(error)) };
      }
    },
  };
}
