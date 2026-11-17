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
    let next = `import velocityCms from '@velocity/cms-astro';\n${must(config, '  integrations: [', '  integrations: [\n    velocityCms(),')}`;
    next = must(
      next,
      '  cache: {',
      "  // Live pages are cached until a publish clears the tag. A day is the backstop, not the refresh rate.\n  routeRules: { '/[...path]': { maxAge: 86400, tags: ['cms'] } },\n\n  cache: {",
    );
    return next;
  });

  // 2. Live collections, the helper that reads them, and the endpoint that clears the cache.
  add('src/live.config.ts', 'live.config.ts');
  add('src/lib/live.ts', 'live.ts');
  add('src/pages/api/cms-revalidate.ts', 'cms-revalidate.ts');

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
      let next = source.replace(/export (async )?function getStaticPaths\(\)/, 'export const prerender = false;\n\nasync function livePaths()');
      next = next.replace(
        /^(const .* = )Astro\.props( as .*)$/m,
        'const live = matchParams(await livePaths(), Astro.params);\nif (!live) return new Response(null, { status: 404 });\n$1live.props$2',
      );
      return next.replace(/^---\n/, "---\nimport { matchParams } from '@/lib/live';\n");
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

  return changes;
}
