---
name: cms-connect-page
description: Move a hard-coded page, header, footer or site setting of a Velocity CMS site onto content people edit, with entryPage, single, menuLinks and linkTo, keeping the template's own values as the fallback. Use when asked to make the home page, a page, the header, the footer, the menu, the logo or contact details editable.
---

# Connect a page to CMS content

Read `.agents/cms.md` first ("Template helpers", "Live pages"). The goal: everything a visitor
sees on the page is edited in the CMS, and the page still looks exactly as it did.

## A built page (home, about, services)

1. List the page's sections top to bottom. For each, find a block in the model that draws it,
   or add one with `cms-add-section`.
2. Make the page an entry of the pages type: in the seed (written by key, with the page's
   current words as the sample content) or with `npx velocity-cms create pages <slug> --data
   '{...}'`. The home page's slug is `index`. A page under another has a slug of several parts
   (`services/roofing`) when the pattern is `/[...slug]`.
3. Delete the hard-coded `.astro` file: the catch-all route (`src/pages/[...slug].astro`, with
   `entryPage(Astro, { types: ['pages'] })`) now draws it. Make sure the pages type is in
   `velocityCms({ entryPages })`.
4. Compare the page before and after, at desktop and phone widths: same sections, same order,
   same words.

## A collection's page (a post, a listing)

Its own route: `export const prerender = false`, then `entryPage(Astro, { types: ['<type>'] })`
and a 404 when nothing is found. Lists read `getLiveCollection('<type>')` and call
`Astro.cache.set(cacheHint)`.

## The header, the footer and menus

1. A menu is a single page with a `list` of `{ label, link }` groups (often `navigation`, field
   `header`; another field for the footer). Add it to the model if it is missing.
2. In the layout: `const edited = await menuLinks(Astro, { type: 'navigation', field: 'header' })`
   and draw `edited.length > 0 ? edited : <the template's own links>`. Each link is
   `{ label, href, external }`, and `columns` for a large menu.
3. Seed the menu with the template's current links, linking to entries (`{ kind: 'entry', type,
   entry: <translation group> }`) where they are pages of the site, so a renamed page keeps its link.

## Site-wide settings (name, logo, phone, social, theme)

1. A single page with `inSettings: true` (and `siteNameField` for the name), so it is a tab of
   the editor's Settings.
2. `const settings = await single(Astro, 'settings')`, and use each value with the template's
   own as the fallback: `typeof settings?.phone === 'string' ? settings.phone : '555 0100'`.
3. The theme (brand colour, fonts) is `color` and `font` fields of such a page, written by the
   layout as CSS variables. Never per section.

## Links and buttons

A `link` value is an entry or a typed address, never a string. `await linkTo(Astro, value)`
gives `{ href, external }` or nothing (an unpublished page): draw the button only when it answered.

## Every page that reads the CMS

- `export const prerender = false`, including pages that read it only through the layout.
- `pageHead(Astro, { title, description })` in the layout, writing what it answers.
- Never read the database or `cms.content` directly: drafts would leak.

## Check

`npx velocity-cms check`, build, and open the page beside `/admin` with the dev server running.
Change a word in the editor, publish, and reload: it should show at once.
