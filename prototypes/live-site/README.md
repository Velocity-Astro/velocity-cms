# Live site: the whole real estate template on live pages

`prototypes/live-pages` proved one route. This prototype converts every page of
the assembled real estate template that shows CMS content, then compares the
running site with the original static build, page by page.

```bash
# in velocity-templates
node scripts/assemble.mjs real-estate --velocity=../velocity
# here (pnpm build first)
node prototypes/live-site/run.mjs ../velocity-templates/build/real-estate
```

`run.mjs` backs the project up, builds the original, imports listings, agents,
neighborhoods and reviews into the CMS, runs `convert.mjs`, builds, serves and
measures, then restores the project (keep the converted copy with `--keep`).

## Results (2026-11-17, 4-core cloud container, Node adapter, in-memory cache, single run)

Files: 4 added, 18 moved unchanged, 22 edited.

| | Original | Live |
|---|---|---|
| Build time | 13.4 s | 8.9 s |
| Pages built ahead of time | 94 | 8 |
| Pages in the search index | 94 | 8 |
| Share images drawn | 56 | 0 |
| Addresses in the sitemap | 90 | 21 |

Sitemap, live site: 90 addresses (index answered 200, lists sitemap-live.xml: true). Missing: 0. Extra: 0.
Search, live site: 88 pages indexed in 2.0 s after start; 556 pages in 10.9 s with 500 listings. That runs once per deploy.
After a street name change: search updated in 27.6 ms (1 page read again). Matches before: 0, after: 1 (/listings/lakeshore-farmhouse/). Share image redrawn: yes.
In a browser, the unchanged search page shows: "1 result for “quillfeather”" First result: "77 Quillfeather Lane". Highlighted words: 1. Errors: 0.
A search answers in 3.7 ms with 562 pages (median of 25). "habitaciones" finds 195 Spanish pages and 0 English ones.

Drafts. A published listing got a new price and a new listing was created, both saved and not published.
  Visitors before any preview: draft hidden on all three pages: yes; new listing page answers 404.
  Preview link: new price shown: yes; headers: private, no-store, noindex, not from the cache.
  The list of homes in the preview shows the new listing: yes; following its link answers 200 and shows it: yes.
  Expired, forged and nonsense tokens: draft hidden: yes (200, 200, 404).
  Visitors after the previews: draft hidden: yes; new listing page answers 404; in search: 0.
  A publish notice without the site's secret answers 404.
Share image: 79.8 ms to draw (status 200), 5.4 ms from the cache.

Pages compared with the original: 93. Different: 0.
Live pages whose share image is missing: 0.

Publish: price changed in both languages and visible on the listing page 61.6 ms later. Seen on: home: yes, homes for sale: yes, listing: yes, listing, Spanish: yes.

| Page | Not cached, 32 listings | Cached, 32 | Not cached, 500 listings | Cached, 500 |
|---|---|---|---|---|
| home | 38.9 ms | 3.2 ms | 101.7 ms | 3.2 ms |
| homes for sale | 26.8 ms | 3.0 ms | 210.9 ms | 8.8 ms |
| listing | 31.4 ms | 2.7 ms | 72.7 ms | 2.7 ms |
| listing, Spanish | 31.7 ms | 2.7 ms | 57.8 ms | 2.5 ms |
| agents | 18.1 ms | 1.9 ms | 49.9 ms | 2.3 ms |

The first table is what the build alone produces. The lines under it are the running site.
Every page has the same text and links as the original (93 compared, 0 different).

## How the conversion works

Most of it now comes with `velocityCms()` in `astro.config.mjs`. The integration adds the live
sitemap, share images, search, the publish notice and preview links. The template itself gets
four small files and one-line edits:

- **`src/live.config.ts`**: one live collection per content type.
- **`src/lib/live.ts`**: `liveCollection`, made by the package from the template's own schemas.
  The template already reads all content through `src/content/estate/index.ts`, so switching
  `getCollection()` to `liveCollection()` there covers every page.
- **Default-language pages** get `export const prerender = false`.
- **Detail pages** (`listings/[slug]` and so on) keep their path function, renamed `livePaths`
  and called per request with `matchParams`, with a 404 when nothing matches.
- **Translated pages.** Each one is a catch-all route (`[lang]/[...about]`). Prerendered, Astro
  sorts out which file owns which address. On demand, the first catch-all takes every address
  and the rest return 404. So the pages move to `src/live-pages/lang/` unchanged, and one
  dispatcher route (two copies of a 12-line file) asks `matchLocalizedPage` which one matches.
- **Caching.** One route rule caches every page for a day under the tag `cms`.

## Sitemap, share images and search

The build made all three from finished pages. Live pages are not built, so they come from
a list of every on-demand address, which the package builds by asking each page for its paths.

- **Sitemap.** `/sitemap-live.xml` lists the live pages, and `sitemap-index.xml` points at it
  beside the built one (`customSitemaps`). Same 90 addresses as the original.
- **Share images.** A second route, `/og/[...live].png`, answers for any card the build did not
  draw. It reads the page's own title and description, draws the same card the build step drew,
  and is cached under the `cms` tag like the page. About 100 ms the first time, 6 ms after.
- **Search.** Kept in the CMS database (`SearchIndex` in `cms-core`, SQLite FTS5 in `cms-db`).
  A search document is a page as a visitor reads it: the text inside `data-pagefind-body`, the
  mark Velocity layouts already use. On publish the site reads only the changed page again
  (about 40 ms). The whole site is read once after a deploy. The search page is unchanged:
  `/cms-search.js` offers the two calls it used from Pagefind and asks `/api/cms/search.json`.
  88 pages are searchable, the same ones as before: the other 6 carry no searchable mark.

  The first version rebuilt a Pagefind index on every publish. It worked, but took 17 s at 562
  pages, because Pagefind cannot change one page of an index.

## Drafts and preview links

An entry now keeps two versions: the one being worked on and the one visitors see. Saving
changes the first; only publishing changes the second. Before this, an edit to a published entry
was live the moment it was saved.

A preview link is any address of the site with `?preview=<token>`. The token is an expiry time
signed with `VELOCITY_CMS_SECRET`. A request with a valid token renders with the working
versions, is never cached or indexed, and has the token added to its links so the person can click
around. The token is in the address and not in a cookie because a cache answers by address before
any code runs: a first version used a cookie, and the cached public page came back.

The test saves a new price on a published listing and creates a new listing, publishes neither,
and checks visitors see neither before or after someone previews, including in search.

## What is still missing

1. **Which pages a publish touches.** The test names the changed listing's page by hand. The
   editor has to work that out: each content type needs to say where its entries appear. List
   pages that show the entry (homes for sale) keep their old search text until the next full
   read; finer cache tags solve both.
2. **Hosts without a disk.** The share
   image route reads the logo and font from the project folder. Fine on a Node server, which is
   what Velocity Cloud would run. Vercel, Netlify and Cloudflare need the assets bundled, and a hosted libSQL database.
3. **Language alternates in the sitemap.** The live sitemap lists addresses only, without
   `hreflang` links. The original has them only for pages whose address is the same in both
   languages, so little is lost, but the live one could do better than the original here.
4. **The site calls itself over HTTP** to read a page for its card and for search, and search results cost a request where Pagefind
   answered in the browser (3.5 ms on the server here). Works, but an
   internal render call would be cleaner; none exists in Astro today.
5. **One tag for everything.** A publish clears every page and every card. Finer tags per entry
   and type come next; the live loader already provides them.
6. **List pages at size.** Homes for sale takes 230 ms uncached with 500 listings.
   Fine behind the cache, but filtering belongs in the database.
7. **One process.** The content memo and page cache live in memory. Several
   servers, or a CDN, need a shared signal.
8. **A preview shows every draft on the site**, not only the entry it was made for, for as long
   as the token lasts (an hour by default). Good for checking how pages fit together. The editor
   decides who may create a link.
9. **Template conventions the package now assumes:** translated pages in `src/live-pages/lang/`,
   detail pages named `[slug].astro` one folder deep, and Velocity's `integrations/og-images.mjs`.
   These should become options, or Velocity should adopt them, before a second template is converted.
10. **The build folder's location is fixed at build time**, for reading built pages into search.
    A site built on one machine and run on another needs it passed in.
