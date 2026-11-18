/**
 * What the editor's three routes share. Compiled with the site, like every file here, so it can
 * read the settings the integration wrote and the site's own mailer.
 */
import { indexPages, siteEditorHost, withEditor, type EditorHost, type SiteEditorSettings } from '@velocity/cms-astro';
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

/** A publish must be seen at once: drops the kept pages, then reads the changed ones for search. */
export async function showPublished(host: EditorHost, cache: PageCache, origin: string): Promise<void> {
  const changed = host.takePublished();
  if (!changed) return;
  await cache.invalidate({ tags: ['cms'] });
  await indexPages(origin, changed).catch((error: unknown) => console.error('[velocity-cms] Search was not updated.', error));
}

/** When the editor was last found not to be set up, so a site without one is not asked on every request. */
let notSetUpAt = 0;

/**
 * Publishes what was set to go out by now, and shows it. A site whose editor is not set up has
 * nothing scheduled, so that is passed over in silence.
 */
export async function publishDue(request: Request, cache: PageCache, origin: string, options: { now?: boolean } = {}): Promise<void> {
  if (Date.now() - notSetUpAt < 30_000) return;
  const host = await siteEditorHost(request, settings).catch(() => null);
  if (!host) {
    notSetUpAt = Date.now();
    return;
  }
  await host.publishDue(options);
  await showPublished(host, cache, origin);
}
