/** What a request can clear kept pages with: Astro's `cache`. */
export interface PageCache {
  invalidate(options: { tags: string[] }): Promise<void>;
}

let told = false;

/**
 * Clears the pages a site kept under `tags`, so a publish is seen at once.
 *
 * One refusal is passed over: Cloudflare's cache is cleared with `cache.purge`, which the Workers
 * runtime on a person's own computer (`wrangler dev`) does not have. Nothing is kept there, so
 * there is nothing to clear, and a publish must not fail over it. The log says so once. Anything
 * else a cache refuses is the caller's to hear of, as before: pages that could not be cleared
 * would go on showing what was unpublished.
 */
export async function clearKeptPages(cache: PageCache, tags: string[]): Promise<void> {
  try {
    await cache.invalidate({ tags });
  } catch (error) {
    if (!(error instanceof TypeError) || !/\bpurge is not a function\b/.test(error.message)) throw error;
    if (!told) console.warn('[velocity-cms] This runtime has no page cache to clear (wrangler dev keeps none). On Cloudflare, a publish clears it.');
    told = true;
  }
}
