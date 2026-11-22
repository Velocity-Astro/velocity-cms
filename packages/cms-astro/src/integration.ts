import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { loadCmsEnv } from './init.js';

const PACKAGE = '@velocity-astro/cms-astro';
const OPTIONS = 'virtual:velocity-cms/options';
const MAILER = 'virtual:velocity-cms/mailer';
const PLUGINS = 'virtual:velocity-cms/plugins';
const IMAGES = 'virtual:velocity-cms/images';
const SITES = 'virtual:velocity-cms/sites';
// Every image in the folder and the folders inside it: a site often keeps its pictures by page or by kind.
const IMAGE_FILES = '**/*.{jpg,jpeg,png,webp,avif,gif}';
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
   * `'./src/assets/photos'`, with the folders inside it. An image is called by its file name
   * without the ending, wherever it sits in the folder; where two share a name, the first by path is kept.
   */
  readonly images?: string;
  /**
   * The site's plugins, each a package name or a file from the project's root whose default
   * export is a `definePlugin(...)`: `['@velocity-astro/cms-plugin-seo', './src/cms/ratings.ts']`.
   * A plugin that cannot start is switched off and listed, with the reason, under Plugins in the editor.
   */
  readonly plugins?: readonly string[];
  /**
   * The content types whose entries are pages one route of the site draws, such as the pages
   * people build in the editor: `['pages']`. Their addresses join the sitemap, search and share
   * images, which otherwise know only the pages the site has files for.
   */
  readonly entryPages?: readonly string[];
  /**
   * For a host that runs many sites from this one copy. The file whose default export is a
   * `SiteRegistry`, from the project's root: `'./src/cms-sites.ts'`. It says which site a host
   * name belongs to, with that site's own database, secret, address and uploads. A host name it
   * does not know gets no site, and nothing is read from the `VELOCITY_CMS_*` settings of one
   * site. Such a copy builds no page ahead of time: every page is drawn for the site that asked.
   * A site of its own leaves this out.
   */
  readonly sites?: string;
}

/**
 * The Velocity CMS integration. Add it to `integrations` in `astro.config.mjs`.
 *
 * It gives a site with live pages what the build used to make from finished pages, and the
 * addresses that go with them:
 *
 * - `/sitemap-live.xml`: the live pages' share of the sitemap
 * - `/og/<page>.png`: a share image for any live page, drawn on first use (on a Velocity site, which has the card drawing)
 * - `/api/cms/search.json` and `/cms-search.js`: search from the CMS database
 * - `/api/cms/submit/<form>` and `/cms-form.js`: where a form posts, and the script that sends it in place
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
 * `npx velocity-cms init <email> <name>` sets both up in a new site and makes the first owner;
 * `npx velocity-cms owner <email> <name>` makes the first owner alone.
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
      'astro:config:setup': ({ config, command, updateConfig, addMiddleware, injectRoute }) => {
        root = fileURLToPath(config.root);
        // The secret a person put in .env must reach the server that runs here, not only the site's code.
        loadCmsEnv(root, command === 'dev' ? 'development' : 'production');
        // The site a request is for is chosen before anything else looks at it.
        if (options.sites) addMiddleware({ entrypoint: route('sites.ts'), order: 'pre' });
        addMiddleware({ entrypoint: `${PACKAGE}/middleware`, order: 'pre' });
        // Entries set to go out at a time are looked for as pages are asked for.
        addMiddleware({ entrypoint: route('due.ts'), order: 'pre' });
        // Loaded with the server, so the plugins are known before the first request.
        if ((options.plugins ?? []).length > 0) addMiddleware({ entrypoint: route('plugins.ts'), order: 'pre' });
        injectRoute({ pattern: '/sitemap-live.xml', entrypoint: route('sitemap-live.xml.ts') });
        // Share images are drawn by Velocity's own card drawing. A site without it keeps its own.
        if (fs.existsSync(path.join(root, 'integrations', 'og-images.mjs'))) injectRoute({ pattern: '/og/[...live].png', entrypoint: route('share-image.png.ts') });
        injectRoute({ pattern: '/api/cms/search.json', entrypoint: route('search.json.ts') });
        injectRoute({ pattern: '/api/cms/published', entrypoint: route('published.ts') });
        injectRoute({ pattern: '/cms-search.js', entrypoint: route('search-client.js.ts') });
        injectRoute({ pattern: '/cms-form.js', entrypoint: route('form-client.js.ts') });
        injectRoute({ pattern: '/cms-preview.js', entrypoint: route('preview-client.js.ts') });
        injectRoute({ pattern: '/media/[file]', entrypoint: route('media.ts') });
        injectRoute({ pattern: '/api/cms/submit/[form]', entrypoint: route('submit.ts') });
        injectRoute({ pattern: '/api/cms/schedule', entrypoint: route('schedule.ts') });
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
                resolveId: (id: string) => (id === OPTIONS || id === MAILER || id === IMAGES || id === PLUGINS || id === SITES ? `\0${id}` : undefined),
                load: (id: string) => {
                  if (id === `\0${OPTIONS}`) {
                    const editor = { site, siteName: options.siteName ?? 'Velocity CMS', adminPath: ADMIN_PATH };
                    return `export default ${JSON.stringify({ unlisted: options.unlisted ?? [], entryPages: options.entryPages ?? [], clientDir, editor })};`;
                  }
                  if (id === `\0${MAILER}`) {
                    return options.mailer
                      ? `export { default } from ${JSON.stringify(path.resolve(root, options.mailer))};`
                      : 'export default undefined;';
                  }
                  if (id === `\0${SITES}`) {
                    return `export { default } from ${JSON.stringify(path.resolve(root, options.sites ?? ''))};`;
                  }
                  if (id === `\0${PLUGINS}`) {
                    // A path is the project's own file; anything else is a package the site installed.
                    const from = (plugin: string) => (/^\.{0,2}\//.test(plugin) ? path.resolve(root, plugin) : plugin);
                    const names = (options.plugins ?? []).map((plugin, index) => `import plugin${index} from ${JSON.stringify(from(plugin))};`);
                    return [...names, `export default [${names.map((_, index) => `plugin${index}`).join(', ')}];`].join('\n');
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
      // A copy that runs many sites builds no page ahead of time. Such a page is built for no
      // site and served to all of them, so one site's name, menu or post would be every site's.
      // Every page is drawn when it is asked for, for the site whose host name asked.
      'astro:route:setup': ({ route: page }) => {
        if (options.sites) page.prerender = false;
      },
      'astro:config:done': ({ config }) => {
        clientDir = fileURLToPath(config.adapter ? config.build.client : config.outDir);
        site = config.site;
      },
    },
  };
}
