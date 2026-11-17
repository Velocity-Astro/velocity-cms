import type { APIRoute } from 'astro';
import { invalidateLiveContent } from '@velocity/cms-astro';
import { rebuildSearchIndex } from '@/lib/live-search';

export const prerender = false;

// Stands in for the editor's publish handler, which will run in this same server.
// Pages are fresh as soon as the cache is cleared. Search follows a moment later.
export const POST: APIRoute = async ({ cache, request, url }) => {
  invalidateLiveContent();
  await cache.invalidate({ tags: ['cms'] });
  const { search } = (await request.json().catch(() => ({}))) as { search?: 'wait' | 'skip' };
  if (search === 'skip') return Response.json({});
  const started = performance.now();
  const rebuilt = rebuildSearchIndex(url.origin);
  if (search !== 'wait') {
    rebuilt.catch((error: unknown) => console.error(error));
    return Response.json({});
  }
  const { pages } = await rebuilt;
  return Response.json({ search: { pages, ms: performance.now() - started } });
};
