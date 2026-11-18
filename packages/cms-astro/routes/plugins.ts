/**
 * Hands the site's plugins to the CMS. Compiled with the site, like every file here, so the
 * site's bundler reads the plugin files; it runs when the server starts, before any request.
 */
import { registerSitePlugins } from '@velocity/cms-astro';
import plugins from 'virtual:velocity-cms/plugins';

registerSitePlugins(plugins);

export const onRequest = (_context: unknown, next: () => Promise<Response>) => next();
