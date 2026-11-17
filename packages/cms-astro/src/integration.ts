import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

const PACKAGE = '@velocity/cms-astro';
const OPTIONS = 'virtual:velocity-cms/options';
const route = (file: string) => fileURLToPath(new URL(`../routes/${file}`, import.meta.url));

export interface VelocityCmsOptions {
  /** Addresses to leave out of the sitemap, such as search results: `['/search/', '/es/buscar/']`. */
  readonly unlisted?: readonly string[];
}

/**
 * The Velocity CMS integration. Add it to `integrations` in `astro.config.mjs`.
 *
 * It gives a site with live pages what the build used to make from finished pages, and the
 * addresses that go with them:
 *
 * - `/sitemap-live.xml`: the live pages' share of the sitemap
 * - `/og/<page>.png`: a share image for any live page, drawn on first use
 * - `/api/cms/search.json` and `/cms-search.js`: search from the CMS database
 * - `/api/cms/published`: where a publish is announced
 * - preview links, through a middleware
 *
 * It also keeps this package out of the site's bundle. The package opens a SQLite database
 * through a native module, which a bundler cannot carry. The routes above are the exception:
 * they are compiled with the site, because they need to see the site's own pages.
 */
export default function velocityCms(options: VelocityCmsOptions = {}): AstroIntegration {
  let clientDir = '';
  return {
    name: PACKAGE,
    hooks: {
      'astro:config:setup': ({ updateConfig, addMiddleware, injectRoute }) => {
        addMiddleware({ entrypoint: `${PACKAGE}/middleware`, order: 'pre' });
        injectRoute({ pattern: '/sitemap-live.xml', entrypoint: route('sitemap-live.xml.ts') });
        injectRoute({ pattern: '/og/[...live].png', entrypoint: route('share-image.png.ts') });
        injectRoute({ pattern: '/api/cms/search.json', entrypoint: route('search.json.ts') });
        injectRoute({ pattern: '/api/cms/published', entrypoint: route('published.ts') });
        injectRoute({ pattern: '/cms-search.js', entrypoint: route('search-client.js.ts') });

        const external = { resolve: { external: [PACKAGE] } };
        updateConfig({
          vite: {
            ssr: { external: [PACKAGE] },
            // Astro builds prerendered pages in their own Vite environment, which does not read `ssr`.
            environments: { ssr: external, prerender: external, astro: external },
            plugins: [
              {
                name: 'velocity-cms:options',
                resolveId: (id: string) => (id === OPTIONS ? `\0${OPTIONS}` : undefined),
                load: (id: string) =>
                  id === `\0${OPTIONS}`
                    ? `export default ${JSON.stringify({ unlisted: options.unlisted ?? [], clientDir })};`
                    : undefined,
              },
            ],
          },
        });
      },
      'astro:config:done': ({ config }) => {
        clientDir = fileURLToPath(config.adapter ? config.build.client : config.outDir);
      },
    },
  };
}
