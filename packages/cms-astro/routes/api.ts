import type { APIRoute } from 'astro';
import { indexPages } from '@velocity/cms-astro';
import { editor } from './editor.ts';

export const prerender = false;

/** The CMS over HTTP, for the editor. Every rule is in the API and the services behind it. */
export const ALL: APIRoute = ({ request, cache, url }) => {
  // The API serves drafts. Nothing it answers may be kept.
  cache.set(false);
  return editor(request, async (host) => {
    const response = await host.api(request);
    // A publish must be seen at once: drop the cached pages, then read the changed ones for search.
    const changed = host.takePublished();
    if (changed) {
      await cache.invalidate({ tags: ['cms'] });
      await indexPages(url.origin, changed).catch((error: unknown) => console.error('[velocity-cms] Search was not updated.', error));
    }
    return response;
  });
};
