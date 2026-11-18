import type { APIRoute } from 'astro';
import { hasSiteSecret } from '@velocity/cms-astro';
import { publishDue } from './editor.ts';

export const prerender = false;

/**
 * For a scheduled job: publishes what was set to go out by now, whether or not anyone is
 * visiting. Only the holder of `VELOCITY_CMS_SECRET` may call it, and it answers with nothing
 * about the content.
 */
const look: APIRoute = async ({ request, cache, url }) => {
  cache.set(false);
  if (!hasSiteSecret(request)) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  await publishDue(request, cache, url.origin, { now: true });
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};

export const GET = look;
export const POST = look;
