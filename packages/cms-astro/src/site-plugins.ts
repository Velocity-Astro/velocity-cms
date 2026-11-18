import { catalogue } from '@velocity-astro/cms-plugins';

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

const nameOf = (plugin: unknown) => (typeof plugin === 'object' && plugin !== null && 'name' in plugin ? plugin.name : undefined);

/**
 * Every plugin a site has: the ones its config names, then the ones that come with the CMS,
 * which wait switched off for an owner to activate. A site's own plugin wins a name, so a
 * developer can put their own in place of one that ships.
 */
export function allPlugins(): readonly unknown[] {
  const taken = new Set(plugins.map(nameOf));
  return [...plugins, ...catalogue.filter((plugin) => !taken.has(plugin.name))];
}
