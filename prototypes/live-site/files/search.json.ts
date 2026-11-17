import type { APIRoute } from 'astro';
import { searchSite } from '@/lib/live-search';

export const prerender = false;

export const GET: APIRoute = async ({ url, cache }) => {
  // Always the database's answer: the index changes with every publish, and a lookup takes about a millisecond.
  cache.set(false);
  const results = await searchSite(url.searchParams.get('q') ?? '', url.searchParams.get('lang') ?? undefined);
  return Response.json(results);
};
