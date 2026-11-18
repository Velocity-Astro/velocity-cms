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
    let next = `import velocityCms from '@velocity/cms-astro';\n${must(config, '  integrations: [', '  integrations: [\n    velocityCms({ unlisted: [...searchPages], images: "./src/assets/photos", plugins: ["./src/cms/publish-log-plugin.ts"], entryPages: ["pages"] }),')}`;
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
  add('src/cms/publish-log-plugin.ts', 'publish-log-plugin.ts');
  add('src/cms/publish-log-editor.js', 'publish-log-editor.js');
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
  // The home page shows the first paragraph of the listing it puts forward.
  edit('src/views/HomeView.astro', (view) => must(view, '{spotlight.description}</p>', '{spotlight.description.paragraphs[0]}</p>'));
  edit('src/views/AgentView.astro', (view) => {
    const next = must(view, '{agent.bio.map((paragraph) => <p>{paragraph}</p>)}', '<Fragment set:html={agent.bio.html} />');
    return must(next, '<div class="text-foreground-secondary flex flex-col gap-4 text-[1.0625rem] leading-relaxed">', '<div class="estate-rich-text text-foreground-secondary flex flex-col gap-4 text-[1.0625rem] leading-relaxed">');
  });

  // 9. What each page says to search engines passes through the CMS, so a plugin such as SEO
  //    can write an entry's own title and description, or ask for the page to be left out.
  edit('src/components/seo/SEO.astro', (source) => {
    let next = must(source, "import siteConfig from '@/config/site.config';", "import { pageHead } from '@velocity/cms-astro';\nimport siteConfig from '@/config/site.config';");
    next = must(
      next,
      'const pageTitle = title ? `${title} — ${siteConfig.name}` : siteConfig.name;',
      'const head = await pageHead(Astro, { ...(title !== undefined && { title }), description, noindex });\nconst pageTitle = head.fullTitle ?? (head.title ? `${head.title} — ${siteConfig.name}` : siteConfig.name);',
    );
    // A demo build asks search engines to leave every page out, whatever a page says; a real one
    // goes by the page, and so by the CMS.
    next = next.replace("const robotsContent = [noindex ? 'noindex' : 'index',", "const robotsContent = [head.noindex ? 'noindex' : 'index',");
    if (!next.includes('content={description}')) throw new Error('Expected to find: content={description}');
    return next.replaceAll('content={description}', 'content={head.description}');
  });

  // 10. Pages built in the editor: the blocks they are made of, and the frame that draws them.
  //     The route that takes every translated page (step 4) also takes these.
  add('src/cms/blocks.ts', 'builder/blocks.ts');
  add('src/components/cms/Blocks.astro', 'builder/Blocks.astro');
  add('src/components/cms/BuilderPage.astro', 'builder/BuilderPage.astro');
  for (const name of fs.readdirSync(path.join(files, 'builder/blocks'))) add(`src/components/cms/blocks/${name}`, `builder/blocks/${name}`);

  // 11. The editor shows a page beside its form, in a frame. Velocity forbids every frame; a
  //     site with the CMS allows its own pages to frame each other and still no other site.
  edit('vercel.json', (text) =>
    must(text, '"key": "X-Frame-Options",\n          "value": "DENY"', '"key": "X-Frame-Options",\n          "value": "SAMEORIGIN"'),
  );

  // 12. The header's links and the footer's "Company" column are a menu people edit in the CMS.
  //     A language with no menu yet keeps the template's own links, and so does a site whose
  //     menu cannot be read. A header link with columns opens a large menu made of them; a
  //     column can ask for every neighborhood, which the template keeps up to date.
  edit('src/components/site/SiteHeader.astro', (source) => {
    let next = must(source, "import Header from '@/components/layout/Header.astro';", "import { menuLinks } from '@velocity/cms-astro';\nimport Header from '@/components/layout/Header.astro';");
    next = must(next, 'const ordered = [\n', 'const own = [\n');
    next = must(
      next,
      '].sort((a, b) => a.order - b.order);\n',
      `].sort((a, b) => a.order - b.order);
const samePage = (a: string, b: string) => a.replace(/\\/$/, '') === b.replace(/\\/$/, '');
const edited = await menuLinks(Astro, { type: 'navigation', field: 'header' });
interface BigMenu {
  href: string;
  active: boolean;
  columns: { title: string; links: { label: string; href: string }[] }[];
  /** What fills the fourth column: the featured home, the rental analysis, or nothing. */
  card: 'listing' | 'analysis' | 'none';
}
const shown: Record<string, BigMenu> = edited.length === 0 ? { buy: { ...menus.buy, card: 'listing' }, management: { ...menus.management, card: 'analysis' } } : {};
const everyNeighborhood = [
  ...neighborhoods.map(({ data }) => ({ label: data.name, href: neighborhoodUrl(data, locale) })),
  { label: t('header.menu.allNeighborhoods'), href: route('neighborhoods') },
];
const ordered: ({ kind: 'menu'; id: string; label: string; order: number } | { kind: 'link'; label: string; href: string; active: boolean; order: number })[] =
  edited.length === 0
    ? own
    : edited.map((link, order) => {
        // A link with columns opens a large menu, and one without is a plain link. The template's
        // own two menus keep their fourth column, which is not a list of links.
        const known = (['buy', 'management'] as const).find((menu) => samePage(menus[menu].href, link.href));
        const columns = (link.columns ?? []).slice(0, 3).map((column) => ({ title: column.title, links: column.show === 'neighborhoods' ? everyNeighborhood : [...column.links] }));
        if (columns.length === 0) return { kind: 'link' as const, label: link.label, href: link.href, active: !link.external && isActive(link.href), order };
        const id = known ?? \`menu-\${order}\`;
        shown[id] = {
          href: link.href,
          active: known ? menus[known].active : isActive(link.href),
          columns,
          card: known === 'buy' ? 'listing' : known === 'management' ? 'analysis' : 'none',
        };
        return { kind: 'menu' as const, id, label: link.label, order };
      });
`,
    );
    // Every place the header read one of its two menus now reads whichever menus are shown.
    next = next.replaceAll('menus[item.id]', 'shown[item.id]');
    next = must(next, "{(['buy', 'management'] as const).map((id) => (", '{Object.keys(shown).map((id) => (');
    next = must(next, '{menus[id].columns.map((column) => (', '{shown[id].columns.map((column) => (');
    next = must(next, "{id === 'buy' && featured ? (", "{shown[id].card === 'none' ? null : shown[id].card === 'listing' && featured ? (");
    if (next.includes('menus[id]') || next.includes('menus[item.id]')) throw new Error('The header still reads a menu the old way. Has the template changed?');
    return next;
  });
  edit('src/components/site/SiteFooter.astro', (source) => {
    let next = must(source, "import Footer from '@/components/layout/Footer.astro';", "import { menuLinks } from '@velocity/cms-astro';\nimport Footer from '@/components/layout/Footer.astro';");
    next = must(next, 'const linkGroups = [\n', "const company = await menuLinks(Astro, { type: 'navigation', field: 'footer' });\nconst linkGroups = [\n");
    return must(
      next,
      "    title: t('footer.company'),\n    links: [\n",
      "    title: t('footer.company'),\n    links: company.length > 0 ? company.map(({ label, href }) => ({ label, href })) : [\n",
    );
  });

  // 13. Home and About are pages built in the editor when the CMS has them published, and the
  //     template's own views until then, so a site is never without either.
  add('src/components/cms/HomeSchema.astro', 'builder/HomeSchema.astro');
  const builtFirst = (view, inside = '') => (source) => {
    let next = must(source, `import ${view} from '@/views/${view}.astro';`, `import { entryPage } from '@velocity/cms-astro';\nimport BuilderPage from '@/components/cms/BuilderPage.astro';${inside && "\nimport HomeSchema from '@/components/cms/HomeSchema.astro';"}\nimport ${view} from '@/views/${view}.astro';`);
    next = must(next, "import { defaultLocale } from '@/i18n';\n", "import { defaultLocale } from '@/i18n';\n\nconst built = await entryPage(Astro, { types: ['pages'] });\n");
    return must(next, `<${view} locale={defaultLocale} />`, `{built ? <BuilderPage page={built.entry.data}>${inside}</BuilderPage> : <${view} locale={defaultLocale} />}`);
  };
  edit('src/pages/index.astro', builtFirst('HomeView', '<HomeSchema />'));
  edit('src/pages/about.astro', builtFirst('AboutView'));

  return changes;
}
