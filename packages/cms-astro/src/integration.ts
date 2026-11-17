import type { AstroIntegration } from 'astro';

/**
 * The Velocity CMS integration. Add it to `integrations` in `astro.config.mjs`.
 *
 * For now it does one thing: keeps the CMS out of the site's bundle. The loader opens a SQLite
 * database through a native module, and Astro bundles the content config into the build. Left
 * alone, the bundler tries to pull the native module in and the build fails. Marking this package
 * as external makes Node load it from `node_modules` at build time instead.
 */
const PACKAGE = '@velocity/cms-astro';

export default function velocityCms(): AstroIntegration {
  return {
    name: '@velocity/cms-astro',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        const external = { resolve: { external: [PACKAGE] } };
        updateConfig({
          vite: {
            ssr: { external: [PACKAGE] },
            // Astro builds prerendered pages in their own Vite environment, which does not read `ssr`.
            environments: { ssr: external, prerender: external, astro: external },
          },
        });
      },
    },
  };
}
