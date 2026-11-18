import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

const PACKAGE = '@velocity/cms-astro';
const OPTIONS = 'virtual:velocity-cms/options';
const MAILER = 'virtual:velocity-cms/mailer';
const IMAGES = 'virtual:velocity-cms/images';
const IMAGE_FILES = '*.{jpg,jpeg,png,webp,avif,gif}';
const ADMIN_PATH = '/admin';
const route = (file: string) => fileURLToPath(new URL(`../routes/${file}`, import.meta.url));

export interface VelocityCmsOptions {
  /** Addresses to leave out of the sitemap, such as search results: `['/search/', '/es/buscar/']`. */
  readonly unlisted?: readonly string[];
  /** The site's name, shown in the editor, in sign-in emails and in the passkey prompt. */
  readonly siteName?: string;
  /**
   * The file whose default export delivers sign-in links by email (a `Mailer`), from the
   * project's root: `'./src/cms-mailer.ts'`. Without one, links are printed to the server's log.
   */
  readonly mailer?: string;
  /**
   * The folder of images that image fields choose from, from the project's root:
   * `'./src/assets/photos'`. An image is called by its file name without the ending.
   */
  readonly images?: string;
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
 * - `/media/<file>`: the images people upload in the editor
 * - preview links, through a middleware
 *
 * And it switches the editor on:
 *
 * - `/admin`: the editor, whose image fields choose from the folder named by `images`
 * - `/api/cms/*`: the API the editor calls
 * - `/api/cms/auth/*`: sign-in with an email link or a passkey
 *
 * Uploads are kept in a folder beside a database that is a file, or in an S3-compatible bucket
 * named by the `VELOCITY_CMS_S3_*` environment variables (see `mediaStoreFromEnv`). A host with
 * neither takes no uploads, and image fields choose from the `images` folder alone.
 *
 * The editor needs `VELOCITY_CMS_SECRET` and the site's address (`site` in the Astro config).
 * The first owner is made with `npx velocity-cms owner <email> <name>`.
 *
 * It also keeps this package out of the site's bundle. The package opens a SQLite database
 * through a native module, which a bundler cannot carry. The routes above are the exception:
 * they are compiled with the site, because they need to see the site's own pages.
 */
export default function velocityCms(options: VelocityCmsOptions = {}): AstroIntegration {
  let clientDir = '';
  let site: string | undefined;
  let root = '';
  return {
    name: PACKAGE,
    hooks: {
      'astro:config:setup': ({ config, updateConfig, addMiddleware, injectRoute }) => {
        root = fileURLToPath(config.root);
        addMiddleware({ entrypoint: `${PACKAGE}/middleware`, order: 'pre' });
        injectRoute({ pattern: '/sitemap-live.xml', entrypoint: route('sitemap-live.xml.ts') });
        injectRoute({ pattern: '/og/[...live].png', entrypoint: route('share-image.png.ts') });
        injectRoute({ pattern: '/api/cms/search.json', entrypoint: route('search.json.ts') });
        injectRoute({ pattern: '/api/cms/published', entrypoint: route('published.ts') });
        injectRoute({ pattern: '/cms-search.js', entrypoint: route('search-client.js.ts') });
        injectRoute({ pattern: '/media/[file]', entrypoint: route('media.ts') });
        injectRoute({ pattern: '/api/cms/auth/[...path]', entrypoint: route('auth.ts') });
        injectRoute({ pattern: '/api/cms/[...path]', entrypoint: route('api.ts') });
        injectRoute({ pattern: `${ADMIN_PATH}/[...path]`, entrypoint: route('admin.ts') });

        const external = { resolve: { external: [PACKAGE] } };
        updateConfig({
          vite: {
            ssr: { external: [PACKAGE] },
            // Astro builds prerendered pages in their own Vite environment, which does not read `ssr`.
            environments: { ssr: external, prerender: external, astro: external },
            plugins: [
              {
                name: 'velocity-cms:options',
                resolveId: (id: string) => (id === OPTIONS || id === MAILER || id === IMAGES ? `\0${id}` : undefined),
                load: (id: string) => {
                  if (id === `\0${OPTIONS}`) {
                    const editor = { site, siteName: options.siteName ?? 'Velocity CMS', adminPath: ADMIN_PATH };
                    return `export default ${JSON.stringify({ unlisted: options.unlisted ?? [], clientDir, editor })};`;
                  }
                  if (id === `\0${MAILER}`) {
                    return options.mailer
                      ? `export { default } from ${JSON.stringify(path.resolve(root, options.mailer))};`
                      : 'export default undefined;';
                  }
                  if (id === `\0${IMAGES}`) {
                    if (!options.images) return 'export default undefined;';
                    const folder = path.relative(root, path.resolve(root, options.images)).split(path.sep).join('/');
                    return [
                      "import { getImage } from 'astro:assets';",
                      `import { folderImages } from ${JSON.stringify(PACKAGE)};`,
                      `const files = import.meta.glob(${JSON.stringify(`/${folder}/${IMAGE_FILES}`)}, { eager: true, import: 'default' });`,
                      // A small copy for the editor, made by the site's own image service.
                      'export default folderImages(files, async (file) => (await getImage({ src: file, width: 480 })).src);',
                    ].join('\n');
                  }
                  return undefined;
                },
              },
            ],
          },
        });
      },
      'astro:config:done': ({ config }) => {
        clientDir = fileURLToPath(config.adapter ? config.build.client : config.outDir);
        site = config.site;
      },
    },
  };
}
