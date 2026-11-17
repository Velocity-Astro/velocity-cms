import type { APIRoute } from 'astro';
import { invalidateLiveContent } from '@velocity/cms-astro';

export const prerender = false;

// Stands in for the editor's publish handler, which will run in this same server.
export const POST: APIRoute = async ({ cache }) => {
  invalidateLiveContent();
  await cache.invalidate({ tags: ['cms'] });
  return new Response('ok');
};
