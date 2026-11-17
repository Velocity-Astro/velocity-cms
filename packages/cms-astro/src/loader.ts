import type { Loader } from 'astro/loaders';
import { createCms, type Actor, type Entry } from '@velocity/cms-core';
import { openDatabase, SqliteEntryRepository, SqliteSchemaRepository } from '@velocity/cms-db';

export interface CmsLoaderOptions {
  /** The key of the content type to load, e.g. `listings`. */
  readonly type: string;
  /**
   * Where the CMS database is. Defaults to the `VELOCITY_CMS_DATABASE_URL` environment variable,
   * then to `file:./cms/data.db`.
   */
  readonly url?: string;
  readonly authToken?: string;
}

/** The build reads content as itself, with read access only. */
const BUILD: Actor = { kind: 'cli', id: 'astro-build', role: 'author' };

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
      const url = options.url ?? process.env.VELOCITY_CMS_DATABASE_URL ?? 'file:./cms/data.db';
      const database = await openDatabase({
        url,
        ...(options.authToken !== undefined && { authToken: options.authToken }),
      });
      try {
        const cms = createCms({
          entries: new SqliteEntryRepository(database.db),
          types: new SqliteSchemaRepository(database.db),
        });
        const type = await cms.schema.getByKey(options.type);

        const seen = new Set<string>();
        let changed = 0;
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const page = await cms.content.find(BUILD, {
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
        database.close();
      }
    },
  };
}

const entryId = (entry: Entry): string => `${entry.locale}/${entry.slug}`;
