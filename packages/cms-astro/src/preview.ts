import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'astro';
import { PreviewLinks } from '@velocity/cms-core';

const PARAMETER = 'preview';
const previewing = new AsyncLocalStorage<boolean>();

/** True while the page being rendered is a preview: the loaders then read the versions being worked on. */
export const isPreview = (): boolean => previewing.getStore() === true;

let links: PreviewLinks | null | undefined;
function previewLinks(): PreviewLinks | null {
  if (links === undefined) {
    const secret = process.env.VELOCITY_CMS_PREVIEW_SECRET;
    links = secret ? new PreviewLinks(secret) : null;
  }
  return links;
}

/**
 * Adds the token to every link that stays on the site, so the person can click around and stay
 * in the preview. A token is digits, a dot and hex, so it needs no escaping.
 */
export function keepPreviewInLinks(html: string, token: string): string {
  return html.replace(
    /(<a\b[^>]*?\shref=")(\/(?!\/)[^"#?]*)(\?[^"#]*)?(#[^"]*)?"/g,
    (_, start: string, path: string, query: string | undefined, hash: string | undefined) =>
      `${start}${path}${query ? `${query}&amp;` : '?'}${PARAMETER}=${token}${hash ?? ''}"`,
  );
}

/**
 * Turns a request with a valid preview token (`?preview=<token>`) into a preview. Without
 * `VELOCITY_CMS_PREVIEW_SECRET` there are no previews at all.
 *
 * The token stays in the address rather than in a cookie, on purpose. A cache, in this server or
 * at a CDN, answers by address before any code runs: with a cookie it would hand the person the
 * public page. An address with a token is one no cache has seen, and it is never stored.
 *
 * A preview is never cached and never indexed, and a request without a valid token is handled
 * exactly as if this middleware were not there.
 */
export const onRequest: MiddlewareHandler = async (context, next) => {
  const signer = previewLinks();
  const token = context.url.searchParams.get(PARAMETER);
  if (!signer || token === null || !(await signer.verify(token))) return next();

  context.cache.set(false);
  // The page is read to the end inside the preview, because Astro renders as the response is read.
  return previewing.run(true, async () => {
    const response = await next();
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Robots-Tag', 'noindex');
    headers.set('Referrer-Policy', 'same-origin');
    headers.delete('Content-Length');
    const isHtml = headers.get('Content-Type')?.includes('text/html') === true;
    const body = isHtml ? keepPreviewInLinks(await response.text(), token) : await response.arrayBuffer();
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  });
};
