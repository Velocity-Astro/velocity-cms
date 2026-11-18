import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'astro';
import { PREVIEW_PARAMETER, PreviewLinks, type EntryData } from '@velocity-astro/cms-core';
import { siteSecret } from './secret.js';
import { refreshUploadedImages } from './site-media.js';

const PARAMETER = PREVIEW_PARAMETER;

/**
 * What someone has typed into one entry and not saved yet. The editor sends it with a preview,
 * so the page beside the form shows the form as it is now. It is drawn once, for the person who
 * sent it, and kept nowhere.
 */
export interface PreviewDraft {
  /** The entry it is for. */
  readonly id: string;
  /** The entry's values as the form holds them, by field id. */
  readonly data: EntryData;
}

interface Preview {
  readonly draft?: PreviewDraft;
}

const previewing = new AsyncLocalStorage<Preview>();

/** True while the page being rendered is a preview: the loaders then read the versions being worked on. */
export const isPreview = (): boolean => previewing.getStore() !== undefined;

/** True while the page being rendered is the one beside the editor's form, which marks its sections so a click can find them. */
export const isEditorPreview = (): boolean => previewing.getStore()?.draft !== undefined;

/**
 * The entry as the preview should show it: with what was typed and not saved, when the preview
 * came with that for this entry. Any other entry, and any entry outside a preview, is given back
 * as it is.
 */
export function withPreviewDraft<T extends { readonly id: string; readonly data: EntryData }>(entry: T): T {
  const draft = previewing.getStore()?.draft;
  return draft && draft.id === entry.id ? { ...entry, data: draft.data } : entry;
}

/** Runs `work` as a preview, for tests and for anything that draws a page outside a request. */
export const asPreview = <T>(work: () => T, draft?: PreviewDraft): T => previewing.run(draft ? { draft } : {}, work);

/** The most a draft sent with a preview may weigh. A page's sections are text; a megabyte is a very long page. */
const DRAFT_LIMIT = 1_000_000;
/** The form field the editor sends a draft in. */
export const DRAFT_FIELD = 'draft';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads the draft the editor posted with a preview. Nothing is read from a request that did not
 * come from the site's own pages, is too large, or is not shaped like a draft: the page is then
 * refused, never drawn from something half understood.
 */
export async function readPreviewDraft(request: Request, site: URL): Promise<PreviewDraft | null> {
  // The browser says where a request came from, and a page cannot change what it says. A proxy
  // in front of the site may change the scheme the site sees, so the host is what is compared.
  const origin = request.headers.get('Origin');
  const isOwn = request.headers.get('Sec-Fetch-Site') === 'same-origin' || (origin !== null && URL.canParse(origin) && new URL(origin).host === site.host);
  if (!isOwn) return null;
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/x-www-form-urlencoded')) return null;
  if (Number(request.headers.get('Content-Length') ?? 0) > DRAFT_LIMIT) return null;
  const body = await request.text();
  if (body.length > DRAFT_LIMIT) return null;
  try {
    const sent: unknown = JSON.parse(new URLSearchParams(body).get(DRAFT_FIELD) ?? '');
    if (!isRecord(sent) || typeof sent['id'] !== 'string' || sent['id'] === '' || !isRecord(sent['data'])) return null;
    return { id: sent['id'], data: sent['data'] };
  } catch {
    return null;
  }
}

/** The address of the script the page beside the editor's form runs. */
export const EDITOR_PREVIEW_SCRIPT = '/cms-preview.js';

/** Adds the script that lets a click on the page find its section in the form. It comes from the site itself, so the page's own rules allow it. */
export function addEditorScript(html: string): string {
  const tag = `<script type="module" src="${EDITOR_PREVIEW_SCRIPT}"></script>`;
  const end = html.lastIndexOf('</body>');
  return end === -1 ? html + tag : html.slice(0, end) + tag + html.slice(end);
}

let links: PreviewLinks | null | undefined;
function previewLinks(): PreviewLinks | null {
  if (links === undefined) {
    const secret = siteSecret();
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

const NOT_PAGES = /^\/(?:api|media|admin|og|_image|_astro|_server-islands|_actions)(?:\/|$)|\.[a-z0-9]+$/;

/** Whether a request is for a page rendered now, which may show uploaded images. */
export const showsContent = (request: Request, pathname: string, isPrerendered: boolean): boolean =>
  !isPrerendered && request.method === 'GET' && !NOT_PAGES.test(pathname);

/**
 * Turns a request with a valid preview token (`?preview=<token>`) into a preview. Without
 * `VELOCITY_CMS_SECRET` there are no previews at all.
 *
 * The token stays in the address rather than in a cookie, on purpose. A cache, in this server or
 * at a CDN, answers by address before any code runs: with a cookie it would hand the person the
 * public page. An address with a token is one no cache has seen, and it is never stored.
 *
 * A preview is never cached and never indexed, and a request without a valid token is handled
 * exactly as if this middleware were not there.
 */
export const onRequest: MiddlewareHandler = async (context, next) => {
  if (showsContent(context.request, context.url.pathname, context.isPrerendered)) {
    // A page without its newest images is still a page, so a failure here is only logged.
    await refreshUploadedImages().catch((error: unknown) => console.error('[velocity-cms] Uploaded images were not read.', error));
  }
  const signer = previewLinks();
  const token = context.url.searchParams.get(PARAMETER);
  if (!signer || token === null || !(await signer.verify(token))) return next();

  context.cache.set(false);
  // The editor posts what is in its form, to see the page before saving. Only a preview takes a
  // post, and only one it can read.
  let draft: PreviewDraft | undefined;
  if (context.request.method === 'POST' && !NOT_PAGES.test(context.url.pathname)) {
    const sent = await readPreviewDraft(context.request.clone(), context.url);
    if (!sent) return new Response('This preview could not be read. Open it again from the editor.', { status: 400, headers: { 'Cache-Control': 'no-store' } });
    draft = sent;
  }
  // The page is read to the end inside the preview, because Astro renders as the response is read.
  return previewing.run(draft ? { draft } : {}, async () => {
    const response = await next();
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Robots-Tag', 'noindex');
    headers.set('Referrer-Policy', 'same-origin');
    headers.delete('Content-Length');
    const isHtml = headers.get('Content-Type')?.includes('text/html') === true;
    const page = isHtml ? keepPreviewInLinks(await response.text(), token) : null;
    const body = page === null ? await response.arrayBuffer() : draft ? addEditorScript(page) : page;
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  });
};
