/**
 * Every address this site renders on demand. Written into `src/lib/live-site.ts` by the prototype.
 *
 * At build time Astro knew every page, so the sitemap, the search index and the share images could
 * all be made from the built files. Live pages are not built, so the same three are made from this
 * list instead. Kept apart from `live.ts`, because it imports the pages and they import that file.
 */
import { routes } from '@/config/nav.config';
import { defaultLocale, locales } from '@/i18n';

interface StaticPath {
  params: Record<string, string | undefined>;
}
interface PageModule {
  getStaticPaths?: () => StaticPath[] | Promise<StaticPath[]>;
  livePaths?: () => StaticPath[] | Promise<StaticPath[]>;
}

const localized = import.meta.glob<PageModule>('/src/live-pages/lang/*.astro', { eager: true });
const detail = import.meta.glob<PageModule>('/src/pages/*/[[]slug[]].astro', { eager: true });
const plain = Object.keys(import.meta.glob('/src/pages/*.astro'));

export interface LiveAddress {
  path: string;
  /** True when the build's own sitemap already has it: a default-language page with a fixed address. */
  fixed: boolean;
  /** False for pages the site keeps out of search engines, such as search results. */
  listed: boolean;
}

/** Search results and saved homes are noindex in every language, as in astro.config.mjs. */
function unlisted(): Set<string> {
  const table: Record<string, { path?: string; slugs?: Record<string, string> }> = routes;
  return new Set(
    ['search', 'saved'].flatMap((id) =>
      locales.map((locale) => {
        const slug = table[id]?.slugs?.[locale] ?? table[id]?.path ?? id;
        return locale === defaultLocale ? `/${slug}/` : `/${locale}/${slug}/`;
      }),
    ),
  );
}

export async function liveAddresses(): Promise<LiveAddress[]> {
  const paths: string[] = [];
  const fixed = new Set<string>();
  for (const file of plain) {
    const name = file.slice('/src/pages/'.length, -'.astro'.length);
    if (name !== '404') fixed.add(name === 'index' ? '/' : `/${name}/`);
  }
  paths.push(...fixed);
  for (const [file, page] of Object.entries(detail)) {
    const section = file.split('/').at(-2);
    for (const { params } of (await page.livePaths?.()) ?? []) paths.push(`/${section}/${params.slug}/`);
  }
  for (const page of Object.values(localized)) {
    for (const { params } of (await page.getStaticPaths?.()) ?? []) {
      const { lang, ...others } = params;
      const rest = Object.values(others)[0];
      paths.push(rest ? `/${lang}/${rest}/` : `/${lang}/`);
    }
  }
  const hidden = unlisted();
  return [...new Set(paths)].sort().map((path) => ({ path, fixed: fixed.has(path), listed: !hidden.has(path) }));
}
