import type { APIContext } from 'astro';
import { sharedConnection } from './connection.js';
import { isPreview } from './preview.js';

/** Where the CMS answers for itself: never moved, whatever an owner lists. */
const OWN = /^\/(?:api|admin|_astro|_image|_server-islands)(?:\/|$)/;

/**
 * A move an owner listed (the Redirects plugin, or any plugin's `pages.redirect`), for a request
 * that found no page. Only a GET or HEAD of a page is moved, never a preview or the CMS's own
 * addresses, and a fault is only logged: the visitor then sees the page that was not found.
 */
export async function redirectFor(context: Pick<APIContext, 'request' | 'url'>, response: Response): Promise<Response | undefined> {
  if (response.status !== 404 || isPreview()) return undefined;
  const { method } = context.request;
  if ((method !== 'GET' && method !== 'HEAD') || OWN.test(context.url.pathname)) return undefined;
  try {
    const { cms } = await sharedConnection({});
    const move = await cms.pages.redirect(context.url.pathname);
    if (!move) return undefined;
    // A path keeps the address's query, so a link's campaign tags reach the new page.
    const to = move.to.startsWith('/') ? `${move.to}${move.to.includes('?') ? '' : context.url.search}` : move.to;
    return new Response(null, { status: move.permanent ? 308 : 307, headers: { Location: to, 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[velocity-cms] The redirects could not be read, so the page not found is shown.', error);
    return undefined;
  }
}
