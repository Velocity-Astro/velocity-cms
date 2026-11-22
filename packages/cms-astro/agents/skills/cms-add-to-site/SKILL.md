---
name: cms-add-to-site
description: Add Velocity CMS to an Astro site, so people edit its content at /admin and publish live. Sets the CMS up, makes the first owner, models the site's existing content and converts the pages that show it. Use when asked to add a CMS, make the site editable, or move content into Velocity CMS.
---

# Add the CMS to this site

Read `.agents/cms.md` once it exists (step 1 writes it). The full guide is
https://docs.deployvelocity.com/cms/converting-a-template/, and `examples/starter` in the CMS's
repository is a small site that does all of this.

## 1. Install

1. The site needs a server adapter. If `astro.config.*` has no `adapter`, add one for where the
   site will live (`npx astro add node`, `vercel`, `netlify`, `cloudflare`).
2. Run `npx velocity-cms init <owner email> "<owner name>"` in the site's folder. It installs
   `@velocity-astro/cms-astro`, writes the secret and local address to `.env`, adds the
   integration, installs `.agents/cms.md` and the `cms-*` skills, and prints a sign-in link for
   the owner. Ask the person for the email and name; never invent them.
3. If `init` printed two lines to add to the config by hand, add them.
4. Set `site` in the config to the real address, or leave a note that it must be set before deploying.

## 2. Audit what the site holds

Write a list before any code:

- built pages (home, about, contact) and the sections each is made of, top to bottom;
- collections (posts, projects, team, listings): anything repeated with one shape;
- site-wide settings (name, logo, phone, social links) and menus (header, footer);
- forms;
- looks a section offers (background, alignment) and the theme (brand colour, fonts).

Two sections that differ only in colour or alignment are one block with a `select` look.

## 3. Model it

Write `cms/model.mjs` with the content types and blocks, and `cms/seed.mjs` that applies them
with `schema.define` and, in an empty database, adds the site's current words as the first
content. Follow `cms-add-content-type` for each type and `cms-add-section` for each block. Add
`"seed": "node --env-file-if-exists=.env cms/seed.mjs"` to `package.json` and run it.

## 4. Convert the pages

Follow `cms-connect-page`: one catch-all route draws the built pages from sections, collections
get live routes, the layout reads menus and settings with `single` and `menuLinks` and writes
the head with `pageHead`. Keep every component; only the words move.

Forms: follow `cms-add-form`.

## 5. Finish

1. `npx velocity-cms check`, and fix every error.
2. Build, start the dev server, open each page and `/admin` beside it. Every word a visitor sees
   on a converted page should be editable there.
3. Tell the person: the sign-in link (it works once, for ten minutes; `npx velocity-cms link
   <email>` makes another), what is still a placeholder, and what they need for going live (see
   `cms-deploy`).
