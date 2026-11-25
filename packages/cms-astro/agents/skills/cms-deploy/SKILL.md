---
name: cms-deploy
description: Put a site on Velocity CMS live or self-host it: the host's settings (secret, address, database on a file, Turso or Cloudflare D1, a bucket for uploads, the mailer, the scheduled publish call, a cache the servers share), the first owner, and a check that the live site answers. Use when asked to deploy, put the site live, self-host, move it to another host, or run it on Cloudflare Workers.
---

# Deploy a site on the CMS

Read `.agents/cms.md` first. A site on the CMS runs on a server: the editor, the API and live
pages need one. Velocity Cloud does all of this for the person; offer it if they would rather
not run a server.

## 1. What the host needs

| Setting | What to put |
|---|---|
| `VELOCITY_CMS_SECRET` | 32 or more random characters (`openssl rand -base64 32`). The same value for the life of the site: sessions, preview links and saved keys depend on it. Never the one from a developer's `.env` if that was ever shared. |
| `VELOCITY_CMS_ORIGIN` | The site's address, `https://example.com`. Sign-in links lead here. Also set `site` in the Astro config. |
| `VELOCITY_CMS_DATABASE_URL` | Where the content lives. A file (`file:/data/cms.db`) works only on a server with a disk that is kept (a VPS, Fly with a volume, Railway). On Vercel or Netlify use Turso: `libsql://<db>.turso.io`. On Cloudflare Workers use a D1 database the Worker is bound to: `d1:<binding>` (see "On Cloudflare Workers" below). |
| `VELOCITY_CMS_DATABASE_TOKEN` | The Turso database's token, for a `libsql://` address. |

Uploads, email and the spam check are set up by the owner in the editor (Settings), with keys
kept encrypted. Set them on the host instead only if the person wants them out of the editor:

- uploads: a bucket (S3, R2, B2) in Settings, Storage; on a server with a kept disk, uploads
  can stay in a folder (`VELOCITY_CMS_MEDIA_DIR`);
- email: Resend in Settings, Email, or `VELOCITY_CMS_RESEND_API_KEY` and
  `VELOCITY_CMS_EMAIL_FROM` on the host. Without one, sign-in links go to the server's log.

Ask the person for every key; never invent one, never commit one, never print one back.

## 2. The adapter and the cache

- The Astro config's adapter must match the host (`@astrojs/node` standalone, `@astrojs/vercel`,
  `@astrojs/netlify`, `@astrojs/cloudflare`).
- Pages are kept under the `cms` tag until a publish clears it. With one server, Astro's
  `memoryCache()` is enough. With several (serverless, more than one instance), use a cache all
  of them share, or a publish clears only one server's copy. Say so to the person if the host
  scales out.

## On Cloudflare Workers (experimental)

With `@astrojs/cloudflare` the CMS is a Worker. Its content is a D1 database and its uploads an R2
bucket, both reached by binding, with no address and no key. Do this in place of the database and
bucket settings above:

1. Make them, and bind them in the Wrangler config with `nodejs_compat`:

   ```sh
   npx wrangler d1 create <site>
   npx wrangler r2 bucket create <site>-media
   ```

   ```jsonc
   // wrangler.jsonc
   {
     "compatibility_flags": ["nodejs_compat"],
     "d1_databases": [{ "binding": "DB", "database_name": "<site>", "database_id": "<the id d1 create printed>" }],
     "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "<site>-media" }],
     "vars": {
       "VELOCITY_CMS_DATABASE_URL": "d1:DB",
       "VELOCITY_CMS_R2_BUCKET": "MEDIA",
       "VELOCITY_CMS_ORIGIN": "https://example.com"
     }
   }
   ```

2. `npx velocity-cms init` writes the same two settings to `.env`, which a Worker reads while
   developing. The shell's environment never reaches a Worker.
3. The secret is never a `var`: `npx wrangler secret put VELOCITY_CMS_SECRET`.
4. Pages are kept in Cloudflare's cache, which every copy of the Worker shares and a publish
   clears: `cache: { provider: cacheCloudflare() }` from `@astrojs/cloudflare/cache`, in place of
   `memoryCache()`, with a route rule that tags the pages `cms`.
5. A page built ahead of time with a library a Worker cannot load (`sharp`, for a share image)
   needs `cloudflare({ prerenderEnvironment: 'node' })`.
6. The Worker brings its database up to date by itself at its first request. The seed and the
   first owner (step 4 below) reach the real database through Wrangler only where the Wrangler
   config marks the D1 binding `"remote": true`; without it they write to the local copy
   `wrangler dev` uses, and the live site stays empty. Say which one a command wrote to.

Images are made lighter by Cloudflare's Images binding (`IMAGES`, which the adapter adds). Nothing
to set up.

## 3. Scheduled publishing

The site looks for entries due to go out on every page request. For a quiet site, have the host
call `POST /api/cms/schedule` with `Authorization: Bearer <VELOCITY_CMS_SECRET>` every few
minutes (a Vercel cron in `vercel.json`, a Netlify scheduled function, a cron on the server).

## 4. The content on the server

1. Run the seed against the live database once, and on every deploy (the build command or a
   release step): `node cms/seed.mjs` with the host's settings. It is safe to run again and
   never touches what people edited.
2. Make the first owner against the live database: `npx velocity-cms owner <email> "<name>"`
   with `VELOCITY_CMS_DATABASE_URL`, `VELOCITY_CMS_SECRET` and `VELOCITY_CMS_ORIGIN` set as on
   the host. It prints a sign-in link that works once, for ten minutes.

## 5. Check it answers

- `/` and a few pages answer 200; `/admin` shows the sign-in screen.
- `npx velocity-cms check` passes locally before the deploy.
- With a token (`VELOCITY_CMS_ORIGIN=https://example.com npx velocity-cms types`), the API
  answers from the live site.
- Publish a small change in the editor and see it on the site within a few seconds.

Tell the person what they still have to do themselves: DNS, the mail service's domain, the
bucket, the owner's first sign-in.
