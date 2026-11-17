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

Files: 9 added, 18 moved unchanged, 21 edited.

| | Original | Live |
|---|---|---|
| Build time | 13.1 s | 9.6 s |
| Pages built ahead of time | 94 | 8 |
| Pages in the search index | 94 | 8 |
| Share images drawn | 56 | 0 |
| Addresses in the sitemap | 90 | 21 |

Sitemap, live site: 90 addresses (index answered 200, lists sitemap-live.xml: true). Missing: 0. Extra: 0.
Search, live site: 94 pages indexed in 2.5 s after start; 562 pages in 17.4 s with 500 listings.
After a street name change: index rebuilt in 2.2 s, new name in the index: yes, share image redrawn: yes.
Share image: 101.4 ms to draw (status 200), 6.5 ms from the cache.

Pages compared with the original: 93. Different: 0.
Live pages whose share image is missing: 0.

Publish: price changed in both languages and visible on the listing page 57.2 ms later. Seen on: home: yes, homes for sale: yes, listing: yes, listing, Spanish: yes.

| Page | Not cached, 32 listings | Cached, 32 | Not cached, 500 listings | Cached, 500 |
|---|---|---|---|---|
| home | 39.2 ms | 3.1 ms | 79.8 ms | 3.0 ms |
| homes for sale | 25.3 ms | 2.9 ms | 230.5 ms | 9.1 ms |
| listing | 29.4 ms | 2.9 ms | 53.6 ms | 2.8 ms |
| listing, Spanish | 31.8 ms | 2.4 ms | 53.1 ms | 2.6 ms |
| agents | 16.4 ms | 2.0 ms | 60.8 ms | 2.0 ms |

The first table is what the build alone produces. The lines under it are the running site.
Every page has the same text and links as the original (93 compared, 0 different).

## How the conversion works

- **Content reads.** The template already reads all content through
  `src/content/estate/index.ts`, so switching `getCollection()` to
  `liveCollection()` there covers every page. `liveCollection` validates with the
  template's own schema and remembers the result until content changes.
- **Default-language pages** get `export const prerender = false`.
- **Detail pages** (`listings/[slug]` and so on) keep their path function, renamed
  and called per request, with a 404 when nothing matches.
- **Translated pages.** Each one is a catch-all route (`[lang]/[...about]`).
  Prerendered, Astro sorts out which file owns which address. On demand, the first
  catch-all takes every address and the rest return 404. So the pages move to
  `src/live-pages/lang/` unchanged, and one dispatcher route asks each page's
  `getStaticPaths` which one matches.
- **Caching.** One route rule caches every page for a day under the tag `cms`.
  `POST /api/cms-revalidate` clears it.

## Sitemap, share images and search

The build made all three from finished pages. Live pages are not built, so they come from
`src/lib/live-site.ts`, which lists every on-demand address by asking each page for its paths.

- **Sitemap.** `/sitemap-live.xml` lists the live pages, and `sitemap-index.xml` points at it
  beside the built one (`customSitemaps`). Same 90 addresses as the original.
- **Share images.** A second route, `og/[...live].png.ts`, answers for any card the build did not
  draw. It reads the page's own title and description, draws the same card the build step drew,
  and is cached under the `cms` tag like the page. About 100 ms the first time, 6 ms after.
- **Search.** On publish the site asks itself for each live page, hands the HTML to Pagefind
  together with the built pages, and swaps the new index in. Pages are fresh at once; search
  follows 2 to 3 seconds later at this size.

## What is still missing

1. **Search does not scale as is.** Every publish re-reads every page: 17 s at 562 pages.
   Pagefind has no way to change one page in an existing index. Options: index only what
   changed into a second small index and merge on a timer, or move search to the database
   (SQLite FTS) with a small endpoint. Decide before phase 1.
2. **Hosts without a disk.** The search index is written into `dist/client`, and the share
   image route reads the logo and font from the project folder. Fine on a Node server, which is
   what Velocity Cloud would run. Vercel, Netlify and Cloudflare need the index in object
   storage and the assets bundled.
3. **Language alternates in the sitemap.** The live sitemap lists addresses only, without
   `hreflang` links. The original has them only for pages whose address is the same in both
   languages, so little is lost, but the live one could do better than the original here.
4. **The site calls itself over HTTP** to read a page for its card and for search. Works, but an
   internal render call would be cleaner; none exists in Astro today.
5. **One tag for everything.** A publish clears every page and every card. Finer tags per entry
   and type come next; the live loader already provides them.
6. **List pages at size.** Homes for sale takes 230 ms uncached with 500 listings.
   Fine behind the cache, but filtering belongs in the database.
7. **One process.** The content memo and page cache live in memory. Several
   servers, or a CDN, need a shared signal.
8. **All of this belongs in Velocity and `cms-astro`**, not in each template: the dispatcher,
   the address list and the three routes. Then a template needs almost no changes of its own.
