import type { APIRoute } from 'astro';
import { editor, showPublished } from './editor.ts';

export const prerender = false;

/** The CMS over HTTP, for the editor. Every rule is in the API and the services behind it. */
export const ALL: APIRoute = ({ request, cache, url }) => {
  // The API serves drafts. Nothing it answers may be kept.
  cache.set(false);
  return editor(request, async (host) => {
    const response = await host.api(request);
    await showPublished(host, cache, url.origin);
    return response;
  });
};
