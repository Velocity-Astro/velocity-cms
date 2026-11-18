/**
 * Looks, on a request for a page, for entries whose time to be published has come. The host
 * looks at most every half minute, so nearly every request passes straight through; the one that
 * finds something waits for it, and so is the first to see the new page.
 */
import type { MiddlewareHandler } from 'astro';
import { publishDue } from './editor.ts';

export const onRequest: MiddlewareHandler = async (context, next) => {
  if (!context.isPrerendered) await publishDue(context.request, context.cache).catch(() => undefined);
  return next();
};
