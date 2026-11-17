# Prototype: live pages

**Question.** Rebuilding the site on publish takes 15 to 60 seconds and grows with the site (see `../publish-speed`). Can content pages instead be rendered on demand from the CMS and cached, so a published change shows at once, without giving up page speed?

**Method.** Take the assembled real estate template and convert one route, the English listing page, from a prerendered page to one rendered on demand:

- a live collection in `src/live.config.ts` reads published entries straight from the CMS through `cmsLiveLoader`;
- the page sets `prerender = false` and caches itself under the tag `cms:listings` with `Astro.cache.set()`;
- a small endpoint clears that tag, standing in for the editor's publish handler.

Then build, start the Node server, and time requests. The CMS holds 500 entries (250 listings in two languages).

```sh
pnpm build
node prototypes/live-pages/bench.mjs ../velocity-templates/build/real-estate 500
```

The script puts every file it changes in the project back when it finishes.

## Result, 2026-11-17

Velocity 2.7.3, Astro 7.4.5 with the Node adapter and Astro's in-memory page cache, Node 22.23.4, a 4-core cloud container. Requests are made from the same machine, so these are server times with no network in them.

| Measurement | Result |
|---|---|
| Prerendered page (`/about/`), median of 50 | 2.0 ms |
| Live listing page, cached, median of 50 | 3.0 ms |
| Live listing page, not cached, median of 10 | 33 ms |
| Live listing page, first request after the server starts | 794 ms |
| Save a new price, clear the cache, and see it on the page | 56 ms |
| Listing that does not exist | 404 |

The build took 12.5 seconds, against 53 to 58 for the fully prerendered site, because the 250 English listing pages are no longer built ahead of time.

## What this tells us

1. **A published change shows in well under a second.** 56 ms from saving to the new price being on the public page, against 15 to 60 seconds for a rebuild. It does not grow with the size of the site.
2. **Cached live pages are as fast as static ones** for practical purposes: 3 ms against 2 ms.
3. **The first visit after a change is slower, and still quick.** 33 ms to read 250 entries, check them and render the page.
4. **Astro 7 already has the pieces.** Live collections, a page cache with tags, and clearing by tag are built in, and Velocity already configures a cache provider per host. We are not inventing a caching layer.
5. **Builds get shorter,** since content pages are no longer built ahead of time.

## What is not proven yet

- **Only one route was converted.** The home page, search, the Spanish listing page, agents and neighborhoods still read listings at build time, so they would show old content. Making a template fully live means converting every page that shows CMS content.
- **Only the Node host with the in-memory cache was measured.** Vercel, Netlify and Cloudflare cache at their CDN through their own providers. They should behave the same way and have not been tried.
- **The in-memory cache is per server process.** It empties on restart and is not shared between several servers. Velocity Cloud needs a shared cache or a CDN in front.
- **The slow first request after a start (794 ms)** is the server loading and the database opening. It matters on hosts that start a fresh process per request burst.
- **Photos.** The template was built with placeholder images. On-demand pages optimise images when asked, which was not measured with real photos.
- **No load test.** These are single requests, one at a time.

## Found along the way

- **`src/live.config.ts` must not import anything that imports `astro:content`.** Importing the template's `config/collections.ts` to reuse its Zod schema made the build hang at "prerendering static routes" with no error. Schemas need to live in a file that imports only Zod, shared by the build-time and live configs. The prototype works around it by checking the entry against the schema in the page.
- **Astro's origin check rejects a POST without a JSON content type** (403, "Cross-site POST form submissions are forbidden"). The editor's API calls must always send one.
- **`loadEntry` scans a locale to find one entry.** The entry repository needs a lookup by slug.
- **The listing URL uses a `path` field, not the slug,** so the page loads the collection and searches it. A lookup by any indexed field would avoid that.
