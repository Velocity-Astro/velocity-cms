# Starter

A small site on Velocity CMS, to run, read and copy from: pages built from sections, a blog, a
contact form and a menu, all edited at `/admin`. It is plain Astro with a stylesheet of its own,
so nothing here depends on a template.

## Run it

From the repository's root, once:

```sh
pnpm install
pnpm build
```

Then here, in `examples/starter`:

```sh
npx velocity-cms init you@example.com "Your Name"   # a secret in .env, and you as the owner
npm run seed                                        # the content types and the sample pages
npm run dev
```

`init` prints a link that signs you in. Open it once the site is running, then open Pages and
change something: it is on the site about a second after you publish.

## What is where

| | |
|---|---|
| `cms/model.mjs` | The kinds of content and the sections a page can be built from, as data. |
| `cms/seed.mjs` | Applies the model and, in an empty database, adds the sample pages. Safe to run on every deploy. |
| `src/components/blocks.ts` | Which component draws which section. |
| `src/components/blocks/` | One component per section. Each takes the section's values as props. |
| `src/pages/[...slug].astro` | One route for every page built in the editor, the home page among them. |
| `src/pages/blog/` | The list of posts (a live collection) and one post. |
| `src/layouts/Layout.astro` | The head, and the menu people edit under Navigation. |
| `astro.config.mjs` | The integration, an adapter and the page cache a publish clears. |

## Add a kind of section

1. Describe it in `cms/model.mjs`, beside the others, and run `npm run seed`.
2. Write its component in `src/components/blocks/`.
3. Name it in `src/components/blocks.ts`, under the same key.

It is then offered under "Add section" in the editor.

## Deploy

The site needs a server (the Node adapter here; any Astro adapter works), `VELOCITY_CMS_SECRET`
and `SITE_URL` set on the host, and a database: the file at `cms/data.db` on a machine that keeps
its disk, or a hosted libSQL database named by `VELOCITY_CMS_DATABASE_URL` and
`VELOCITY_CMS_DATABASE_TOKEN` anywhere else.

`npm run check` builds the site from an empty database and asks for every page. CI runs it.
