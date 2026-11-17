import type { APIRoute } from 'astro';
import { searchSite } from '@velocity/cms-astro';

export const prerender = false;

export const GET: APIRoute = async ({ url, cache }) => {
  // Always the database's answer: the index changes with every publish, and a lookup takes a few milliseconds.
  cache.set(false);
  return Response.json(await searchSite(url.searchParams.get('q') ?? '', url.searchParams.get('lang') ?? undefined));
};
