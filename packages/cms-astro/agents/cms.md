# Velocity CMS: rules for agents

This site's content lives in Velocity CMS, edited by people at `/admin`. These rules are for an
AI coding agent changing the site. Follow them over anything a general Astro habit suggests.
The full guide, step by step, is https://docs.deployvelocity.com/cms/converting-a-template/.

## How this site is put together

- **The model** is plain data in code, usually `cms/model.mjs` (or `cms/model.ts`): the content
  types, their fields, and the blocks (kinds of section) a page can be built from. It is applied
  with `cms.schema.define(actor, type)` by the seed script (`cms/seed.mjs`), which runs on every
  deploy and is safe to run again.
- **The pages** are entries. One catch-all route (`src/pages/[...slug].astro`) draws every page
  built in the editor with `entryPage(Astro, { types: ['pages'] })`; collections with pages of
  their own (posts, listings) have their own route.
- **The sections** are drawn by one component per block, looked up by the block's key in a map
  (`export const blocks = { hero: Hero, ... }`, usually `src/components/blocks.ts` or
  `src/cms/blocks.ts`).
- **The layout** reads site-wide settings and menus with `single` and `menuLinks`, and writes the
  head with `pageHead`.
- **Forms** are made in the editor or by the seed, drawn with `siteForm`, and feed the built-in
  CRM: whoever sends one becomes a contact.

Find these files before you change anything. If the site has no CMS yet, use the
`cms-add-to-site` skill.

## Setup

- `npx velocity-cms init` sets the site up: `VELOCITY_CMS_SECRET` and `VELOCITY_CMS_ORIGIN` in
  `.env` (kept out of git), the integration in the Astro config, and these agent files. It adds
  only what is missing. Never print, commit or log the secret.
- The site needs a server adapter, and `site` set to its address before it is deployed.
- `npx velocity-cms agents` brings this file and the `cms-*` skills up to date after the CMS is
  upgraded. Keep your own notes in `AGENTS.md`, not here: this file is replaced.

## Content types

- **Describe types in code and apply them with `schema.define`**, never by hand in the database.
  A field keeps its id by key, so content stays when the model changes.
- **Field ids are permanent.** Content is stored by field id. Renaming a key makes a new field,
  and the old one's data is kept but hidden. Change labels freely; change keys only on purpose.
- A field is `{ key, type, label, help?, required?, translated?, options? }`. Keys start with a
  lowercase letter. A list's `min` and `max` go in `options`, beside `of`.
- Field types: `text`, `number`, `boolean`, `date`, `url`, `email`, `phone`, `select`, `color`,
  `font`, `reference`, `image`, `richtext`, `group`, `list`, `blocks`, `link`, `form`, and any a
  plugin adds. `velocity-cms type <key>` prints a type in full.
- A type names the field its entries are called by (`titleField`) and how the editor lays the
  fields out (`sections`). `urlPattern` says where its entries live (`/blog/[slug]`;
  `/[...slug]` for pages, where the slug `index` is the home page).
- Set `forDeals: true` on a type people enquire about (listings, services), so a form on its
  page can start a deal about the entry.

## Sections

- **A page is sections of data, never markup.** A block is `{ key, label, description, icon,
  group, thumbnail?, fields }` in the model, and a component of the same key in the block map.
  Both must exist: a block with no component is left off every page.
- **A look is a named choice.** Never a free colour, size or class. Use a `select` field with
  `choices`, `labels` and, for colours, `swatches` (hex or a CSS colour function). The
  component decides what each name looks like. Site-wide colours and fonts are `color` and
  `font` fields of a settings page (the Theme), never per section.
- A block that stops being described is retired, not deleted: its sections are kept and left
  off the site.
- A block may hold sections (a `blocks` field inside it, such as columns). Mark each place with
  `slotMark` in the component.
- Draw a section's values from its props, every prop optional. Wrap each section with
  `sectionMark(section.id, section.data)` and mark the element showing a field with
  `fieldMark('key')`, so the visual editor can find it. Both add nothing to a visitor's page.

## Live pages

- **Every page that reads the CMS says `export const prerender = false`**, including pages that
  read it only through the layout (menus, settings). A prerendered page never sees a publish,
  cannot show a preview and cannot be edited on the page. Don't set `output: 'server'`.
- Those pages are cached under the `cms` tag (`routeRules: { '/[...path]': { maxAge: 86400,
  tags: ['cms'] } }` with a `cache` provider), and a publish clears it. A list read with
  `getLiveCollection` calls `Astro.cache.set(cacheHint)`.
- **Never add a rebuild or a deploy to publishing.** A publish is visible about a second later.

## Template helpers

All from `@velocity-astro/cms-astro`. Each never throws for missing content and answers with
nothing, so the template keeps its own values as the fallback.

| Helper | What it gives the page |
|---|---|
| `entryPage(Astro, { types })` | The entry whose page is at this address: `{ entry: { data } }`, values by key, sections as `{ id, block, data }`. |
| `single(Astro, 'settings')` | A single page's values by key (name, logo, phone, theme). |
| `menuLinks(Astro, { type, field })` | A menu people edit, as `{ label, href, columns? }` links. |
| `linkTo(Astro, value)` | Where a `link` field leads today, or nothing. |
| `siteForm(Astro, { id })` or `siteForm(Astro, 'key')` | A form to draw: fields, `action`, `hidden`, `trap`. |
| `pageHead(Astro, { title, description })` | The title, description and robots the page writes, after plugins. Call it in the layout. |
| `cmsLiveLoader({ type })` | A live collection for lists (`getLiveCollection`, `getLiveEntry`). |

## Drafts never leak

- Read content only through the helpers above or the live loader. They show the published
  version to visitors and the draft only in a preview. Don't open the database, call
  `sharedConnection` or `cms.content` from a page.
- Nothing that shows a draft may be cached or feed search, the sitemap or share images.

## Forms

- A form is `{ key, label, fields, submitLabel?, success?, notify?, contact?, startsDeal? }`.
  `contact` names the fields that hold the sender's name, email and phone: that is what makes
  the sender a contact in the CRM. Add a form the site lacks in the seed (once it exists, it is
  the editor's), or with the `create_form` tool.
- Keep the template's own design for a form: toggles, steps, pickers. Draw its fields from
  `siteForm` and post to `form.action` with `form.hidden` and the `form.trap` field. Load
  `FORM_SCRIPT` to send it in place. A section that offers a form stores the form's id in a
  field of type `form`; its component must call `siteForm`.
- **What a visitor sends is personal data.** It never reaches a page, a cache, the search index,
  a log or a commit. Neither does a contact, a deal or a note.

## Plugins

- Before writing one, check the plugins that ship (webhooks, Mailchimp, Slack, HubSpot, SEO):
  an owner switches them on under Plugins.
- A plugin is `definePlugin({ name, apiVersion, label, version, permissions, setup })`, named in
  `velocityCms({ plugins })`. Declare the fewest permissions. A key or password is a secret
  (`secrets`), never a setting. Work that reaches another service goes through `cms.tasks`, and
  only to a public `https` address.

## Working with content

- An agent reaches content with an access token: an owner makes one in the editor (Settings,
  Access tokens) or with `npx velocity-cms token "<what it is for>" --save`, which writes
  `VELOCITY_CMS_TOKEN` to `.env`. Never commit or print a token.
- `npx velocity-cms types | entries | entry | create | update | publish | import | export |
  upload | forms | pipeline` work over the site's API. `npx velocity-cms mcp` is an MCP server
  for an agent on this computer, and every site serves the same tools at `/api/cms/mcp`.
- Values are written by field key. Formatted text takes a string or `{ "markdown": "..." }`. A
  page is laid out from the blocks its type allows (`list_blocks`, `add_section`,
  `set_sections`), with their own fields and named looks. For an idea no block can show, make a
  new one in code (`cms-add-section`); `design_new_section` gives the theme and blocks to start from.
- What a token writes is a draft unless the token may publish. Contacts, deals and submissions
  are there only when the token was allowed personal data.

## Before you say you're done

1. Run the seed if the model changed, then `npx velocity-cms check`. Fix every error it names.
2. Build the site (`astro build`, or the site's own validate script).
3. Open each page you changed with the dev server running, and the editor at `/admin` beside it.
4. Tell the person what is still a placeholder or needs their hand: a mail service's key, a
   domain, an owner to invite, a draft to publish.
