import type { Loader } from 'astro/loaders';
import type { Entry } from '@velocity/cms-core';
import { connect, SITE, type ConnectionOptions } from './connection.js';

export interface CmsLoaderOptions extends ConnectionOptions {
  /** The key of the content type to load, e.g. `listings`. */
  readonly type: string;
}

const PAGE_SIZE = 500;

/**
 * A Content Layer loader that feeds a collection from Velocity CMS.
 *
 * It replaces the `file()` or `glob()` loader in a collection and nothing else: the collection's
 * Zod schema, its pages and its queries stay exactly as they are. Only published entries are
 * loaded, and each gets the id `<locale>/<slug>`, the convention Velocity's templates already use.
 *
 * ```ts
 * const listings = defineCollection({
 *   loader: cmsLoader({ type: 'listings' }),
 *   schema: z.object({ ... }),
 * });
 * ```
 */
export function cmsLoader(options: CmsLoaderOptions): Loader {
  return {
    name: 'velocity-cms',
    async load({ store, parseData, generateDigest, logger }) {
      const { cms, close } = await connect(options);
      try {
        const type = await cms.schema.getByKey(options.type);

        const seen = new Set<string>();
        let changed = 0;
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const page = await cms.content.find(SITE, {
            typeId: type.id,
            status: 'published',
            limit: PAGE_SIZE,
            offset,
          });
          for (const entry of page.items) {
            const id = entryId(entry);
            seen.add(id);
            const data = { ...cms.content.toPublic(type, entry).data, slug: entry.slug, locale: entry.locale };
            // The digest lets Astro skip an entry that has not changed since the last build.
            const digest = generateDigest({ revision: entry.revision, data });
            if (store.get(id)?.digest === digest) continue;
            store.set({ id, data: await parseData({ id, data }), digest });
            changed++;
          }
          if (offset + page.items.length >= page.total || page.items.length === 0) break;
        }

        for (const id of store.keys()) {
          if (!seen.has(id)) store.delete(id);
        }
        logger.info(`${options.type}: ${seen.size} published, ${changed} changed since the last build`);
      } finally {
        close();
      }
    },
  };
}

const entryId = (entry: Entry): string => `${entry.locale}/${entry.slug}`;
