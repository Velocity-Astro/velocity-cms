---
name: cms-add-content-type
description: Add a kind of content to a site on Velocity CMS (case studies, team members, listings, services, events) or a field to one, described in code and applied with schema.define, with its list and detail pages rendered live. Use when asked to add a content type, a collection, a post type, or a field such as square footage.
---

# Add a content type or a field

Read `.agents/cms.md` first. This replaces the plain Astro way (a folder of Markdown files and
a `content.config.ts` collection) on a site whose content lives in the CMS.

## 1. Describe it in the model

Open the site's model (usually `cms/model.mjs`) and add the type beside the others, with the
site's own helpers if it has them:

```js
const caseStudies = {
  key: 'case-studies',
  kind: 'collection',                 // or 'single' for one page of settings or a menu
  label: { en: 'Case studies' },
  urlPattern: '/work/[slug]',         // leave out for content with no page of its own
  titleField: 'title',
  fields: [
    { key: 'title', type: 'text', label: { en: 'Title' }, required: true },
    { key: 'client', type: 'text', label: { en: 'Client' } },
    { key: 'cover', type: 'image', label: { en: 'Cover' } },
    { key: 'summary', type: 'text', label: { en: 'Summary' }, options: { multiline: true } },
    { key: 'body', type: 'richtext', label: { en: 'Story' }, required: true },
  ],
  sections: [
    { key: 'story', label: { en: 'Story' }, fields: ['title', 'body'] },
    { key: 'about', label: { en: 'About' }, fields: ['client', 'cover', 'summary'], aside: true },
  ],
};
export const model = [/* ...the others, */ caseStudies];
```

- Every language the site has gets a label (`{ en, es }`). Add `localizedUrlPatterns` for pages
  in other languages.
- A choice among fixed values is a `select` with `choices` and `labels`. A link to another entry
  is a `link` field. Repeated items are a `list` of a `group`.
- **To add a field to a type that has content**, add it to the list. Never rename a key to
  "fix" it: that is a new field, and the old content is hidden. Never remove a field to change
  its type; add a new key.
- A type people enquire about takes `forDeals: true`. A single page of site settings takes
  `inSettings: true` (and `siteNameField` for the field that holds the site's name).

## 2. Apply it

Run the seed (`npm run seed`, or `node --env-file-if-exists=.env cms/seed.mjs`). It calls
`schema.define` for every type. Check with `npx velocity-cms type case-studies`.

## 3. Pages

For a type with `urlPattern`:

1. A live collection in `src/live.config.ts`:
   `'case-studies': defineLiveCollection({ loader: cmsLiveLoader({ type: 'case-studies' }) })`.
2. The list page, such as `src/pages/work/index.astro`, with `export const prerender = false`,
   reading `getLiveCollection('case-studies')` and calling `Astro.cache.set(cacheHint)`.
3. The detail page, such as `src/pages/work/[slug].astro`, with `export const prerender = false`
   and `const found = await entryPage(Astro, { types: ['case-studies'] })`, answering 404 when
   nothing is found. Values are `found.entry.data`, by key. Formatted text is `{ html }`: render
   it with `set:html={body.html}` (it is escaped already). An image field holds the image's
   name: `uploadedImage(name)` gives an upload's `url`, `width` and `height`; an image the
   template ships is looked up by file name, as the site's other pages do.
4. Add the type's key to `velocityCms({ entryPages: [...] })` only if the catch-all route draws
   it; give it its own route otherwise. Add the list to the nav through the menu in the CMS,
   not by hard-coding a link, if the site's menu is in the CMS.
5. Write strings a visitor reads that are not content (headings like "More work") the way the
   site already does (its translations), not hard-coded.

## 4. Sample content

If the site is new or the type is empty, add one or two entries so the pages show something:
in the seed (only when the database is empty), or with `npx velocity-cms create`. Never
publish sample content on a live site without asking.

## 5. Check

`npx velocity-cms check`, then build and open both pages with the dev server running.
