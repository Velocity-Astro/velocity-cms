import type { APIRoute } from 'astro';
import { editor } from './editor.ts';

export const prerender = false;

/** The editor's page and the files it loads. */
export const ALL: APIRoute = ({ request, cache }) => {
  cache.set(false);
  return editor(request, (host) => host.admin(request));
};
