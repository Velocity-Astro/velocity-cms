import type { APIRoute } from 'astro';
import { EDITOR_PREVIEW_VERSION, PREVIEW_BRIDGE_SCRIPT } from '@velocity-astro/cms-astro';

export const prerender = false;

/**
 * What the page beside the editor's form runs (`src/preview-bridge.ts`). The preview adds it to
 * that page only, and it does nothing unless the page is in a frame of the same site.
 *
 * The page asks for it by the mark of this version, and a browser keeps that: the page is drawn
 * again with every change in the form, and a script that is at hand runs before the page is seen,
 * so the page comes back where it was. Asked for any other way, it is fetched each time, since a
 * copy kept from before an upgrade would not know what the editor now says to it.
 */
export const GET: APIRoute = ({ url }) => {
  const kept = url.searchParams.get('v') === EDITOR_PREVIEW_VERSION ? 'private, max-age=31536000, immutable' : 'no-cache';
  return new Response(PREVIEW_BRIDGE_SCRIPT, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': kept } });
};
