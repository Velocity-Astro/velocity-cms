/**
 * What the editor's three routes share. Compiled with the site, like every file here, so it can
 * read the settings the integration wrote and the site's own mailer.
 */
import { currentSite, indexPages, pagesOrigin, siteCacheTag, siteEditorHost, withEditor, type EditorHost, type SiteEditorSettings } from '@velocity-astro/cms-astro';
import images from 'virtual:velocity-cms/images';
import mailer from 'virtual:velocity-cms/mailer';
import options from 'virtual:velocity-cms/options';

const settings: SiteEditorSettings = { ...options.editor, dev: import.meta.env.DEV, mailer, images };

export const editor = (request: Request, answer: (host: EditorHost) => Response | Promise<Response>) =>
  withEditor(request, settings, answer);

/** What a request can clear kept pages with. */
interface PageCache {
  invalidate(options: { tags: string[] }): Promise<void>;
}

/** Where the site reads its own pages from: never an address a request merely claims. `null` when it cannot tell. */
export const ownOrigin = (request: Request): string | null => pagesOrigin(request, settings);

/** A publish must be seen at once: drops the kept pages, then reads the changed ones for search. */
export async function showPublished(host: EditorHost, cache: PageCache, origin: string | null): Promise<void> {
  const changed = host.takePublished();
  if (!changed) return;
  await cache.invalidate({ tags: [siteCacheTag()] });
  if (origin === null) return;
  await indexPages(origin, changed).catch((error: unknown) => console.error('[velocity-cms] Search was not updated.', error));
}

/** When each site's editor was last found not to be set up, so a site without one is not asked on every request. */
const notSetUpAt = new Map<string, number>();

/**
 * Publishes what was set to go out by now, and shows it. A site whose editor is not set up has
 * nothing scheduled, so that is passed over in silence.
 */
export async function publishDue(request: Request, cache: PageCache, options: { now?: boolean } = {}): Promise<void> {
  const site = currentSite()?.id ?? '';
  if (Date.now() - (notSetUpAt.get(site) ?? 0) < 30_000) return;
  const host = await siteEditorHost(request, settings).catch(() => null);
  if (!host) {
    notSetUpAt.set(site, Date.now());
    return;
  }
  await host.publishDue(options);
  await showPublished(host, cache, ownOrigin(request));
}
