import type { APIRoute } from 'astro';
import { editor } from './editor.ts';

export const prerender = false;

/** An app's own side of connecting by itself (OAuth): where it finds its way, registers and gets its tokens. */
export const ALL: APIRoute = ({ request, cache }) => {
  // What is answered here is for one app at one moment.
  cache.set(false);
  return editor(request, (host) => host.connect(request));
};
