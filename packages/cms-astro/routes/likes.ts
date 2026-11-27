import type { APIRoute } from 'astro';
import { siteLikePosts } from '@velocity-astro/cms-astro';
import options from 'virtual:velocity-cms/options';

export const prerender = false;

/** Where a page's like button asks how many and sends a like. Anyone may reach it: every check is in `LikePosts`. */
export const ALL: APIRoute = async (context) => {
  // A count is for this moment, and an answer to one visitor is never kept for the next.
  context.cache.set(false);
  let address: string | undefined;
  try {
    address = context.clientAddress;
  } catch {
    // Some hosts do not say. The other checks still stand.
  }
  return (await siteLikePosts({ ...options.editor, dev: import.meta.env.DEV })).handle(context.request, address);
};
