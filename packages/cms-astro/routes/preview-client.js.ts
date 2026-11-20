import type { APIRoute } from 'astro';
import { PREVIEW_BRIDGE_SCRIPT } from '@velocity-astro/cms-astro';

export const prerender = false;

/**
 * What the page beside the editor's form runs (`src/preview-bridge.ts`). The preview adds it to
 * that page only, and it does nothing unless the page is in a frame of the same site.
 */
export const GET: APIRoute = () =>
  new Response(PREVIEW_BRIDGE_SCRIPT, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
