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

Files: 5 added, 18 moved unchanged, 21 edited.

| | Original | Live |
|---|---|---|
| Build time | 13.8 s | 9.5 s |
| Pages built ahead of time | 94 | 8 |
| Pages in the search index | 94 | 8 |
| Share images drawn | 56 | 0 |
| Addresses in the sitemap | 90 | 21 |

Pages compared with the original: 93. Different: 0.
Live pages whose share image is missing: 56.

Publish: price changed in both languages and visible on the listing page 66.7 ms later. Seen on: home: yes, homes for sale: yes, listing: yes, listing, Spanish: yes.

| Page | Not cached, 32 listings | Cached, 32 | Not cached, 500 listings | Cached, 500 |
|---|---|---|---|---|
| home | 43.9 ms | 3.2 ms | 77.0 ms | 3.4 ms |
| homes for sale | 32.8 ms | 3.1 ms | 229.9 ms | 9.4 ms |
| listing | 27.0 ms | 2.8 ms | 71.9 ms | 2.7 ms |
| listing, Spanish | 22.7 ms | 2.6 ms | 70.7 ms | 2.9 ms |
| agents | 14.4 ms | 2.1 ms | 38.6 ms | 2.0 ms |

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

## What this shows is still missing

1. **Search.** Pagefind indexes built HTML, so live pages drop out (94 to 8 pages).
   Needs an index built from CMS content on publish.
2. **Share images.** Drawn only for prerendered pages (56 to 0). Needs an
   on-demand, cached image route, or drawing on publish.
3. **Sitemap.** On-demand routes with parameters are left out (90 to 21). Needs a
   sitemap route fed by the CMS.
4. **One tag for everything.** A publish clears every page. Finer tags per entry
   and type come next; the live loader already provides them.
5. **List pages at size.** Homes for sale takes 230 ms uncached with 500 listings.
   Fine behind the cache, but filtering belongs in the database.
6. **One process.** The content memo and page cache live in memory. Several
   servers, or a CDN, need a shared signal.
7. **The dispatcher belongs in Velocity**, not in each template. With that, and
   content reads in one file, a template needs almost no changes of its own.
