# Prototype: publish speed

**Question.** Velocity sites are static, so publishing means rebuilding the site. Is that fast enough? The target in the plan is under 60 seconds at 500 entries.

**Method.** Assemble the real estate template, then build it with the stock JSON loader and with the CMS loader, at the template's own size (32 listing entries: 16 listings in two languages) and at 500 entries (250 listings in two languages, made by copying the originals under new slugs).

```sh
# in velocity-templates
node scripts/assemble.mjs real-estate --velocity=../velocity
(cd build/real-estate && pnpm install)

# here
pnpm build
node prototypes/publish-speed/bench.mjs ../velocity-templates/build/real-estate 500
```

`compare.mjs <dist-a> <dist-b>` checks that two builds have the same visible text and links on every page.

## Result, 2026-11-17

Velocity 2.7.3, Astro 7.4.5, Node 22.23.4, a 4-core cloud container with 15 GB of memory. One run of each, so read differences of a second or two as noise.

| Build | Seconds | Pages |
|---|---|---|
| JSON file, 32 entries, cold | 13.8 | 94 |
| JSON file, 32 entries, warm | 13.8 | 94 |
| CMS, 32 entries, cold | 15.0 | 94 |
| CMS, 32 entries, warm | 14.4 | 94 |
| JSON file, 500 entries, cold | 55.6 | 562 |
| JSON file, 500 entries, warm | 52.9 | 562 |
| CMS, 500 entries, cold | 55.7 | 562 |
| CMS, 500 entries, warm, nothing changed | 57.9 | 562 |
| CMS, 500 entries, warm, one listing edited | 57.3 | 562 |

"Cold" clears Astro's caches first. "Warm" builds again on top of the previous build.

Where a 500-entry build spends its time, from one build log:

| Phase | Seconds |
|---|---|
| Content sync, including the loader | under 1 |
| Bundling | about 4 |
| Rendering 562 pages | about 17 |
| Drawing 524 share images | about 30 |
| Search index | about 2 |

## What this tells us

1. **The loader works and changes nothing a visitor sees.** The site built from the CMS has the same text and links as the site built from JSON on all 94 pages. The collection's Zod schema, pages and queries were not touched: one line swaps the loader.
2. **The CMS adds no measurable build time.** Reading 500 entries from SQLite takes well under a second. Build time follows the number of pages, whichever loader is used.
3. **The 60-second target is met at 500 entries, with almost no margin.** 53 to 58 seconds on this machine. A smaller build machine, or a site past about 550 entries, would miss it.
4. **Editing one listing rebuilds everything.** The loader's digests let Astro skip unchanged entries during content sync, but Astro still renders every page. Publish time does not depend on how much changed.
5. **More than half the time is share images, and that is fixable.** Velocity redraws the share image for every page on every build. Caching them by content would take a 500-entry publish to roughly 25 seconds. That estimate is the measured total minus the measured image time; it has not been built.

## What to do about it

- **Cache share images between builds** in Velocity's `og-images` integration. Largest win, smallest change.
- **Keep the build cache on Velocity Cloud** between publishes, so warm builds are the normal case.
- **Decide what happens above about 1,000 entries.** Options: render detail pages on demand with caching on hosts that support it, or publish in the background and show progress. Not needed for v1's target, and worth a decision before a customer with 2,000 listings arrives.
- **Show publish progress in the editor.** At 15 to 60 seconds a publish is not instant, so the editor must say what is happening and when the change is live.

## Found along the way

- **Astro bundles any package that has `astro` as a peer dependency**, and the loader's SQLite driver is a native module that can't be bundled. The build failed with `Cannot find module '@libsql/linux-x64-gnu'` until `@velocity/cms-astro` was marked external, both in its `package.json` (`"astro": { "external": true }`) and in each of Astro's build environments, including `prerender`. The integration in `packages/cms-astro/src/integration.ts` now does this.
- **Nested field ids.** `SchemaService` assigns ids to a type's top-level fields, but the fields inside a group are passed in with ids already set. The service should assign those too.
- **Not tested yet:** hosts without a disk (Vercel, Netlify, Cloudflare) reading a hosted libSQL database during a build, and builds on a small machine.
