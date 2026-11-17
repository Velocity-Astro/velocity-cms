import type { APIRoute } from 'astro';
import { invalidateLiveContent } from '@velocity/cms-astro';
import { indexPages, indexSite } from '@/lib/live-search';

export const prerender = false;

interface Publish {
  /** Pages whose content changed, or `all` after a deploy. The editor will work these out itself. */
  reindex?: string[] | 'all';
}

// Stands in for the editor's publish handler, which will run in this same server.
export const POST: APIRoute = async ({ cache, request, url }) => {
  invalidateLiveContent();
  await cache.invalidate({ tags: ['cms'] });
  const { reindex } = (await request.json().catch(() => ({}))) as Publish;
  if (!reindex) return Response.json({});
  const started = performance.now();
  const pages = reindex === 'all' ? await indexSite(url.origin) : await indexPages(url.origin, reindex);
  return Response.json({ search: { pages, ms: performance.now() - started } });
};
