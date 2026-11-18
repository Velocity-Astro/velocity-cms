/**
 * What a site needs once its pages are rendered on demand: the work `getStaticPaths` did at build
 * time, done per request instead, and the list of addresses the build used to know by itself.
 */
import { isPreview } from './preview.js';
import { liveContentVersion } from './live-loader.js';

export interface StaticPath {
  readonly params: Readonly<Record<string, string | undefined>>;
  readonly props?: Readonly<Record<string, unknown>>;
}

/** A page file as Vite hands it over: its component, and the functions that list its addresses. */
export interface PageModule<Component = unknown> {
  readonly default: Component;
  readonly getStaticPaths?: () => readonly StaticPath[] | Promise<readonly StaticPath[]>;
  /** What a detail page (`listings/[slug].astro`) exports once it is rendered on demand. */
  readonly livePaths?: () => readonly StaticPath[] | Promise<readonly StaticPath[]>;
}

const same = (a: string | undefined, b: string | undefined) => (a || undefined) === (b || undefined);

/** The path whose params are the ones in this request, as Astro would have matched at build time. */
export function matchParams<Path extends StaticPath>(
  paths: readonly Path[],
  params: Readonly<Record<string, string | undefined>>,
): Path | undefined {
  return paths.find((path) => Object.entries(path.params).every(([key, value]) => same(params[key], value)));
}

/**
 * Velocity gives every translated page its own catch-all route under `[lang]`, and tells them
 * apart with `getStaticPaths`. Rendered on demand, the first of those routes would take every
 * address. So one route takes them all and asks each page whether the address is its own.
 */
export async function matchLocalizedPage<Component>(
  pages: Readonly<Record<string, PageModule<Component>>>,
  lang: string | undefined,
  rest: string | undefined,
): Promise<{ Page: Component; props: Readonly<Record<string, unknown>> } | undefined> {
  if (!lang) return undefined;
  for (const page of Object.values(pages)) {
    const paths = (await page.getStaticPaths?.()) ?? [];
    const match = paths.find(({ params }) => {
      const { lang: pathLang, ...others } = params;
      return pathLang === lang && same(Object.values(others)[0], rest);
    });
    if (match) return { Page: page.default, props: match.props ?? {} };
  }
  return undefined;
}

export interface LiveAddress {
  readonly path: string;
  /** True for a default-language page with a fixed address, which the build's own sitemap already has. */
  readonly fixed: boolean;
  /** False for pages the site keeps out of search engines, such as search results. */
  readonly listed: boolean;
}

export interface PageSources {
  /** File names of the pages with a fixed address: `/src/pages/about.astro`. */
  readonly fixed: readonly string[];
  /** Detail pages by file name: `/src/pages/listings/[slug].astro`. */
  readonly detail: Readonly<Record<string, PageModule>>;
  /** Translated pages, wherever the site keeps them. */
  readonly localized: Readonly<Record<string, PageModule>>;
  /** The pages people made in the editor, which no file lists: `/our-story/`. */
  readonly entries?: readonly string[];
  /** Addresses to leave out of the sitemap. */
  readonly unlisted?: readonly string[];
}

/** Every address the site renders on demand, in a stable order. */
export async function liveAddresses(sources: PageSources): Promise<LiveAddress[]> {
  const fixed = new Set<string>();
  for (const file of sources.fixed) {
    const name = file.slice(file.lastIndexOf('/') + 1, -'.astro'.length);
    if (name !== '404' && !name.includes('[')) fixed.add(name === 'index' ? '/' : `/${name}/`);
  }
  const paths = [...fixed];
  for (const [file, page] of Object.entries(sources.detail)) {
    const section = file.split('/').at(-2);
    for (const { params } of (await page.livePaths?.()) ?? []) paths.push(`/${section}/${params.slug}/`);
  }
  for (const page of Object.values(sources.localized)) {
    for (const { params } of (await page.getStaticPaths?.()) ?? []) {
      const { lang, ...others } = params;
      const rest = Object.values(others)[0];
      paths.push(rest ? `/${lang}/${rest}/` : `/${lang}/`);
    }
  }
  // A page the site builds from a file wins over an entry at the same address, as it does when drawn.
  paths.push(...(sources.entries ?? []));
  const hidden = new Set(sources.unlisted ?? []);
  return [...new Set(paths)].sort().map((path) => ({ path, fixed: fixed.has(path), listed: !hidden.has(path) }));
}

interface LiveEntry<Data> {
  readonly id: string;
  readonly collection: string;
  readonly data: Data;
}
interface LiveResult {
  readonly entries?: readonly { id: string; data: unknown }[];
  readonly error?: Error;
}

/**
 * Stands in for `getCollection`: same call, same entries, read from the CMS at request time.
 * Entries are checked with the collection's own schema, read once per publish and kept in memory.
 * A preview reads the versions being worked on, fresh every time and never remembered.
 *
 * ```ts
 * export const liveCollection = liveCollections(getLiveCollection, { listings: listingsSchema });
 * ```
 */
export function liveCollections<Schemas extends Record<string, { parse(data: unknown): unknown }>>(
  getLiveCollection: (name: string) => Promise<LiveResult>,
  schemas: Schemas,
) {
  type Name = keyof Schemas & string;
  type Entry = LiveEntry<ReturnType<Schemas[Name]['parse']>>;
  const memo = new Map<string, { version: number; entries: Promise<Entry[]> }>();

  const load = async (name: Name): Promise<Entry[]> => {
    const { entries, error } = await getLiveCollection(`${name}Live`);
    if (error) throw error;
    const schema = schemas[name];
    if (!schema) throw new Error(`No schema was given for the live collection "${name}".`);
    return (entries ?? []).map((entry) => ({ id: entry.id, collection: name, data: schema.parse(entry.data) as Entry['data'] }));
  };

  return async function liveCollection(name: Name, filter?: (entry: Entry) => boolean): Promise<Entry[]> {
    let entries: Entry[];
    if (isPreview()) {
      entries = await load(name);
    } else {
      const version = liveContentVersion();
      let cached = memo.get(name);
      if (!cached || cached.version !== version) {
        cached = { version, entries: load(name) };
        memo.set(name, cached);
      }
      entries = await cached.entries;
    }
    return filter ? entries.filter(filter) : [...entries];
  };
}
