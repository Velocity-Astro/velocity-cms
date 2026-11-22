---
name: cms-import-content
description: Bring existing content into Velocity CMS from another site or from files (WordPress, Markdown posts, a spreadsheet, JSON): map it onto content types, import entries and pictures as drafts, keep old addresses, and report what could not be taken. Use when asked to import, migrate, move content over, or load posts, products or listings from a file.
---

# Import content

Read `.agents/cms.md` first ("Working with content"). Imports go through the site's API, as
drafts, so nothing reaches visitors until someone publishes.

## 1. Get access

The commands need the site running (or its live address) and an access token:

- `npx velocity-cms token "Import" --save` makes one from this computer and writes
  `VELOCITY_CMS_TOKEN` to `.env` (it needs the site's database, so it works locally). For a
  live site, ask an owner to make one in the editor under Settings, Access tokens.
- Start the dev server (`npm run dev`), or set `VELOCITY_CMS_ORIGIN` to the live address.
- Check with `npx velocity-cms types`.

## 2. Map the old content onto content types

1. Look at a few items of the old content and at `npx velocity-cms type <type>`. Make a table:
   old field, new field key, and what to do with it.
2. If the site has no type for it, add one first (`cms-add-content-type`).
3. Keep old addresses: the slug is the last part of the old URL. Where the URL pattern differs
   (`/2024/05/hello` became `/blog/hello`), tell the person which redirects the host needs.

Get the content into one of these:

- **Markdown files** with front matter (a folder of `.md`): front matter keys become fields,
  the text under it goes into the type's formatted text field (`--body <key>` to choose).
  WordPress: export with a tool such as `wordpress-export-to-markdown`, or read its REST API
  (`/wp-json/wp/v2/posts`) and write the files yourself.
- **JSON**: a list of `{ "slug": "...", "locale": "en", "data": { "<key>": value } }`. Formatted
  text may be `{ "markdown": "..." }`. Build this from a CSV or an export with a short script.

## 3. Try it, then import

```sh
npx velocity-cms import posts ./old-posts --dry-run       # says what would come in and what is left out
npx velocity-cms import posts ./old-posts --map date=publishedAt --map summary=excerpt
```

- Keys the type has no field for are left out and named; `--map old=new` keeps one.
- A picture an `image` field names by a path on this computer is uploaded, and the field holds
  its name. A picture by address must be downloaded first (by you, with the person's OK). Pictures
  inside the text are left out: formatted text holds no pictures.
- An entry whose slug is already there is left alone unless `--update`.
- Everything comes in as a draft. Add `--publish` only when the person asks, and only with a
  token that may publish.

## 4. Report

Tell the person, from the command's own report:

- how many came in, and which were refused and why;
- what was left out (fields, pictures inside text) and what you suggest for each;
- which redirects the old addresses need;
- that the entries are drafts, and where to review them (`/admin`, the type's list).

Never import personal data (people's names, emails, orders) into a content type: contacts go to
the CRM (`cms-set-up-crm`), with the person's say-so.
