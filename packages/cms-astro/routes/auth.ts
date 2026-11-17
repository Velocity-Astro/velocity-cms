import type { APIRoute } from 'astro';
import { editor } from './editor.ts';

export const prerender = false;

/** Sign-in: email links and passkeys. */
export const ALL: APIRoute = ({ request, cache }) => {
  cache.set(false);
  return editor(request, (host) => host.signIn(request));
};
