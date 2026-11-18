/**
 * The plugins a site named in its config. They are the site's own files, so the site's bundler
 * reads them: a small file compiled with the site hands them over here when the server starts,
 * and the site's one connection starts them before anything reads content.
 */
let plugins: readonly unknown[] = [];

/** Called once by the file the integration adds, before any request is answered. */
export function registerSitePlugins(found: readonly unknown[]): void {
  plugins = found;
}

export const sitePlugins = (): readonly unknown[] => plugins;
