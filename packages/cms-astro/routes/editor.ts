/**
 * What the editor's three routes share. Compiled with the site, like every file here, so it can
 * read the settings the integration wrote and the site's own mailer.
 */
import { withEditor, type EditorHost, type SiteEditorSettings } from '@velocity/cms-astro';
import images from 'virtual:velocity-cms/images';
import mailer from 'virtual:velocity-cms/mailer';
import options from 'virtual:velocity-cms/options';

const settings: SiteEditorSettings = { ...options.editor, dev: import.meta.env.DEV, mailer, images };

export const editor = (request: Request, answer: (host: EditorHost) => Response | Promise<Response>) =>
  withEditor(request, settings, answer);
