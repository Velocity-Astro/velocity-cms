import type { APIRoute } from 'astro';
import { hasSiteSecret, indexPages, indexSite, invalidateLiveContent } from '@velocity/cms-astro';
import { addresses, clientDir } from './pages.ts';

export const prerender = false;

interface Notice {
  /** Pages whose content changed, or `all` after a deploy. The editor will work these out itself. */
  reindex?: string[] | 'all';
}

/**
 * Tells the running site that published content changed: pages are fresh on the next request and
 * search follows. Only the holder of `VELOCITY_CMS_SECRET` may call it. Once the editor runs in
 * this same server it will call these functions directly and this address goes away.
 */
export const POST: APIRoute = async ({ cache, request, url }) => {
  if (!hasSiteSecret(request)) return new Response(null, { status: 404 });
  invalidateLiveContent();
  await cache.invalidate({ tags: ['cms'] });
  const { reindex } = (await request.json().catch(() => ({}))) as Notice;
  if (!reindex) return Response.json({});
  const started = performance.now();
  const everything = async () => indexSite(url.origin, clientDir, (await addresses()).map((address) => address.path));
  const pages = reindex === 'all' ? await everything() : await indexPages(url.origin, reindex);
  return Response.json({ search: { pages, ms: performance.now() - started } });
};
