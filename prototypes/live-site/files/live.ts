/**
 * Live content for a Velocity template. Written into `src/lib/live.ts` by the prototype.
 *
 * `liveCollection` stands in for `getCollection`: same call, same entries, read from the CMS at
 * request time instead of from the build. `matchParams` and `matchLocalizedPage` stand in for
 * what `getStaticPaths` did at build time: find the page and props for the address asked for.
 */
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import { getLiveCollection } from 'astro:content';
import { liveContentVersion } from '@velocity/cms-astro';
import { siteCollections } from '@/config/collections';
import { isValidLocale } from '@/i18n';

type CollectionName = keyof typeof siteCollections;
interface LiveEntry {
  id: string;
  collection: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prototype: typed entries come with the real integration
  data: any;
}

const memo = new Map<string, { version: number; entries: Promise<LiveEntry[]> }>();

async function load(name: CollectionName): Promise<LiveEntry[]> {
  const { entries, error } = await getLiveCollection(`${name}Live`);
  if (error) throw error;
  // The same Zod schema the build-time collection uses, so defaults and checks still apply.
  const schema = siteCollections[name].schema as { parse(data: unknown): unknown };
  return (entries ?? []).map((entry: { id: string; data: unknown }) => ({
    id: entry.id,
    collection: name,
    data: schema.parse(entry.data),
  }));
}

/** Published entries of a collection, read once per content version and then kept in memory. */
export async function liveCollection(name: CollectionName, filter?: (entry: LiveEntry) => boolean): Promise<LiveEntry[]> {
  const version = liveContentVersion();
  let cached = memo.get(name);
  if (!cached || cached.version !== version) {
    cached = { version, entries: load(name) };
    memo.set(name, cached);
  }
  const entries = await cached.entries;
  return filter ? entries.filter(filter) : [...entries];
}

interface StaticPath {
  params: Record<string, string | undefined>;
  props?: Record<string, unknown>;
}

/** The path whose params are the ones in this request, as Astro would have matched at build time. */
export function matchParams(paths: StaticPath[], params: Record<string, string | undefined>): StaticPath | undefined {
  return paths.find((path) => Object.entries(path.params).every(([key, value]) => (params[key] || undefined) === (value || undefined)));
}

interface PageModule {
  default: AstroComponentFactory;
  getStaticPaths?: () => StaticPath[] | Promise<StaticPath[]>;
}

/**
 * Velocity gives every translated page its own catch-all route under `[lang]`, and tells them
 * apart with `getStaticPaths`. Rendered on demand, the first of those routes would take every
 * address. So one route takes them all and asks each page whether the address is its own.
 */
export async function matchLocalizedPage(
  pages: Record<string, unknown>,
  lang: string | undefined,
  rest: string | undefined,
): Promise<{ Page: AstroComponentFactory; props: Record<string, unknown> } | undefined> {
  if (!lang || !isValidLocale(lang)) return undefined;
  for (const page of Object.values(pages) as PageModule[]) {
    const paths = (await page.getStaticPaths?.()) ?? [];
    const match = paths.find(({ params }) => {
      const { lang: pathLang, ...others } = params;
      return pathLang === lang && (Object.values(others)[0] || undefined) === (rest || undefined);
    });
    if (match) return { Page: page.default, props: match.props ?? {} };
  }
  return undefined;
}
