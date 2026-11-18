/**
 * Converts an assembled Velocity template from prerendered pages to live pages.
 * A prototype codemod: it shows what has to change in a template, file by file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const files = path.join(path.dirname(fileURLToPath(import.meta.url)), 'files');
const CMS_COLLECTIONS = ['listings', 'agents', 'neighborhoods', 'reviews'];

export function convert(project) {
  const at = (relative) => path.join(project, relative);
  const read = (relative) => fs.readFileSync(at(relative), 'utf8');
  const write = (relative, content) => {
    fs.mkdirSync(path.dirname(at(relative)), { recursive: true });
    fs.writeFileSync(at(relative), content);
  };
  const changes = { added: [], moved: [], edited: [] };
  const add = (relative, source) => {
    write(relative, fs.readFileSync(path.join(files, source), 'utf8'));
    changes.added.push(relative);
  };
  const edit = (relative, transform) => {
    const before = read(relative);
    const after = transform(before);
    if (after === before) throw new Error(`Nothing changed in ${relative}. Has the template changed?`);
    write(relative, after);
    changes.edited.push(relative);
  };
  const must = (text, find, replacement) => {
    if (!text.includes(find)) throw new Error(`Expected to find: ${find}`);
    return text.replace(find, replacement);
  };

  // 1. The integration, and a cache rule for every page rendered on demand.
  edit('astro.config.mjs', (config) => {
    let next = `import velocityCms from '@velocity/cms-astro';\n${must(config, '  integrations: [', '  integrations: [\n    velocityCms({ unlisted: [...searchPages], images: "./src/assets/photos" }),')}`;
    next = must(
      next,
      '  cache: {',
      "  // Live pages are cached until a publish clears the tag. A day is the backstop, not the refresh rate.\n  routeRules: { '/[...path]': { maxAge: 86400, tags: ['cms'] } },\n\n  cache: {",
    );
    return must(next, '    sitemap({', "    sitemap({\n      customSitemaps: [new URL('/sitemap-live.xml', process.env.SITE_URL || 'https://example.com').href],");
  });

  // 2. Live collections and the helper that reads them. Search, the sitemap, share images and
  //    the publish notice come with the integration.
  add('src/live.config.ts', 'live.config.ts');
  add('src/lib/live.ts', 'live.ts');
  edit('src/views/SearchView.astro', (view) => must(view, "const url = '/pagefind/pagefind.js';", "const url = '/cms-search.js';"));

  // 3. The one file that reads content now reads it live.
  edit('src/content/estate/index.ts', (source) => {
    let next = must(
      source,
      "import { getCollection, type CollectionEntry } from 'astro:content';",
      "import { getCollection, type CollectionEntry } from 'astro:content';\nimport { liveCollection } from '@/lib/live';",
    );
    for (const name of CMS_COLLECTIONS) next = next.replaceAll(`getCollection('${name}'`, `liveCollection('${name}'`);
    return next;
  });

  // 4. Translated pages: out of the router, behind one route that picks the right one.
  const langDir = at('src/pages/[lang]');
  for (const entry of fs.readdirSync(langDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.astro')) continue;
    const name = entry.name.replace(/^\[\.\.\.(.+)\]\.astro$/, '$1.astro');
    const to = `src/live-pages/lang/${name}`;
    fs.mkdirSync(path.dirname(at(to)), { recursive: true });
    fs.renameSync(path.join(langDir, entry.name), at(to));
    changes.moved.push(`src/pages/[lang]/${entry.name} -> ${to}`);
  }
  add('src/pages/[lang]/[...path].astro', 'dispatcher.astro');
  add('src/pages/[lang]/index.astro', 'dispatcher.astro');

  // 5. Default-language pages with a parameter: look the entry up at request time.
  for (const route of ['agents/[slug].astro', 'listings/[slug].astro', 'neighborhoods/[slug].astro']) {
    edit(`src/pages/${route}`, (source) => {
      let next = source.replace(/export (async )?function getStaticPaths\(\)/, 'export const prerender = false;\n\nexport async function livePaths()');
      next = next.replace(
        /^(const .* = )Astro\.props( as .*)$/m,
        'const live = matchParams(await livePaths(), Astro.params);\nif (!live) return new Response(null, { status: 404 });\n$1live.props$2',
      );
      return next.replace(/^---\n/, "---\nimport { matchParams } from '@velocity/cms-astro';\n");
    });
  }
  edit('src/pages/listing-catalog/[locale].json.ts', (source) =>
    source.replace(/export function getStaticPaths\(\) \{\n[^\n]*\n\}/, 'export const prerender = false;'),
  );

  // 6. Default-language pages without a parameter: render on demand.
  for (const name of fs.readdirSync(at('src/pages'))) {
    if (!name.endsWith('.astro') || name === '404.astro') continue;
    edit(`src/pages/${name}`, (source) => source.replace(/^---\n/, '---\nexport const prerender = false;\n'));
  }

  // 7. Photos people upload in the editor: looked up where the project's own photos are, and
  //    fetched by the site's image service from the site itself.
  add('src/lib/uploads.ts', 'uploads.ts');
  edit('src/content/estate/index.ts', (source) => {
    const next = must(
      source,
      "  Object.entries(photoFiles).find(([file]) => file.split('/').pop()?.split('.')[0] === name)?.[1].default;",
      "  Object.entries(photoFiles).find(([file]) => file.split('/').pop()?.split('.')[0] === name)?.[1].default ?? uploadedPhoto(name);",
    );
    return must(next, "import { liveCollection } from '@/lib/live';", "import { liveCollection } from '@/lib/live';\nimport { uploadedPhoto } from '@/lib/uploads';");
  });
  edit('src/components/patterns/MediaSlot.astro', (source) => {
    const next = must(source, ')?.[1].default;\n', ')?.[1].default ?? uploadedPhoto(photo);\n');
    return must(next, "import { cn } from '@/lib/cn';", "import { cn } from '@/lib/cn';\nimport { uploadedPhoto } from '@/lib/uploads';");
  });
  edit('astro.config.mjs', (config) =>
    must(config, "  image: {\n", "  image: {\n    // Uploaded photos are served by this site, and resized by it like any other.\n    domains: [new URL(process.env.SITE_URL || 'https://example.com').hostname],\n"),
  );

  // 8. Descriptions and biographies are shaped in the editor: the CMS hands them over as HTML
  //    it made from what was written, and the pages show that.
  add('src/lib/rich-text.ts', 'rich-text.ts');
  add('src/styles/rich-text.css', 'rich-text.css');
  edit('src/styles/estate.css', (css) => `@import './rich-text.css';\n${css}`);
  edit('src/config/collections.ts', (source) => {
    let next = must(source, '      description: z.array(z.string()).min(1),', '      description: richText,');
    next = must(next, '    bio: z.array(z.string()).min(1),', '    bio: richText,');
    return `import { richText } from '@/lib/rich-text';\n${next}`;
  });
  edit('src/views/ListingView.astro', (view) => {
    let next = must(view, '  description: listing.description[0],', '  description: listing.description.paragraphs[0],');
    next = must(next, '{listing.description.map((paragraph) => <p>{paragraph}</p>)}', '<Fragment set:html={listing.description.html} />');
    return must(next, 'class="text-foreground-secondary flex max-w-3xl flex-col gap-4 text-[1.0625rem] leading-relaxed"', 'class="estate-rich-text text-foreground-secondary flex max-w-3xl flex-col gap-4 text-[1.0625rem] leading-relaxed"');
  });
  edit('src/views/AgentView.astro', (view) => {
    const next = must(view, '{agent.bio.map((paragraph) => <p>{paragraph}</p>)}', '<Fragment set:html={agent.bio.html} />');
    return must(next, '<div class="text-foreground-secondary flex flex-col gap-4 text-[1.0625rem] leading-relaxed">', '<div class="estate-rich-text text-foreground-secondary flex flex-col gap-4 text-[1.0625rem] leading-relaxed">');
  });

  return changes;
}
