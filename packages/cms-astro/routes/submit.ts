import type { APIRoute } from 'astro';
import { siteFormPosts, type SiteEditorSettings } from '@velocity/cms-astro';
import images from 'virtual:velocity-cms/images';
import mailer from 'virtual:velocity-cms/mailer';
import options from 'virtual:velocity-cms/options';

export const prerender = false;

const settings: SiteEditorSettings = { ...options.editor, dev: import.meta.env.DEV, mailer, images };

/** Where the site's forms post. The one address of the CMS that anyone may send to: every check is in `FormPosts`. */
export const ALL: APIRoute = async (context) => {
  // An answer to one visitor is never kept for the next.
  context.cache.set(false);
  let address: string | undefined;
  try {
    address = context.clientAddress;
  } catch {
    // Some hosts do not say. The other checks still stand.
  }
  return (await siteFormPosts(settings)).handle(context.request, context.params.form ?? '', address);
};
