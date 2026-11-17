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

Files: 11 added, 18 moved unchanged, 22 edited.

| | Original | Live |
|---|---|---|
| Build time | 14.0 s | 9.1 s |
| Pages built ahead of time | 94 | 8 |
| Pages in the search index | 94 | 8 |
| Share images drawn | 56 | 0 |
| Addresses in the sitemap | 90 | 21 |

Sitemap, live site: 90 addresses (index answered 200, lists sitemap-live.xml: true). Missing: 0. Extra: 0.
Search, live site: 88 pages indexed in 1.8 s after start; 556 pages in 11.3 s with 500 listings. That runs once per deploy.
After a street name change: search updated in 43.4 ms (1 page read again). Matches before: 0, after: 1 (/listings/lakeshore-farmhouse/). Share image redrawn: yes.
In a browser, the unchanged search page shows: "1 result for “quillfeather”" First result: "77 Quillfeather Lane". Highlighted words: 1. Errors: 0.
A search answers in 3.5 ms with 562 pages (median of 25). "habitaciones" finds 195 Spanish pages and 0 English ones.
Share image: 86.2 ms to draw (status 200), 5.6 ms from the cache.

Pages compared with the original: 93. Different: 0.
Live pages whose share image is missing: 0.

Publish: price changed in both languages and visible on the listing page 49.6 ms later. Seen on: home: yes, homes for sale: yes, listing: yes, listing, Spanish: yes.

| Page | Not cached, 32 listings | Cached, 32 | Not cached, 500 listings | Cached, 500 |
|---|---|---|---|---|
| home | 44.7 ms | 3.7 ms | 94.6 ms | 3.5 ms |
| homes for sale | 25.7 ms | 2.5 ms | 250.3 ms | 8.5 ms |
| listing | 28.9 ms | 2.6 ms | 68.4 ms | 2.9 ms |
| listing, Spanish | 22.1 ms | 2.3 ms | 45.3 ms | 2.5 ms |
| agents | 12.7 ms | 1.9 ms | 42.8 ms | 2.0 ms |

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
- **Search.** Kept in the CMS database (`SearchIndex` in `cms-core`, SQLite FTS5 in `cms-db`).
  A search document is a page as a visitor reads it: the text inside `data-pagefind-body`, the
  mark Velocity layouts already use. On publish the site reads only the changed page again
  (about 40 ms). The whole site is read once after a deploy. The search page is unchanged:
  `public/cms-search.js` offers the two calls it used from Pagefind and asks `/api/search.json`.
  88 pages are searchable, the same ones as before: the other 6 carry no searchable mark.

  The first version rebuilt a Pagefind index on every publish. It worked, but took 17 s at 562
  pages, because Pagefind cannot change one page of an index.

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
8. **All of this belongs in Velocity and `cms-astro`**, not in each template: the dispatcher,
   the address list and the three routes. Then a template needs almost no changes of its own.
