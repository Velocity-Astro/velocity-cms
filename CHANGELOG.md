# Changelog

Every package is released together under one version. While versions are `0.x`, a release may change the plugin API or the way a site describes its content. Each such change is listed here under "Changed", with how to move.

## Unreleased

## 0.1.0-beta.4

- **Settings in the editor, starting with email.** Owners have a Settings screen. Under Email they choose the email service (Resend), paste its API key, say who email comes from, and send themselves a test, with no change to the server. The key is sealed with the site's secret and never sent back to the editor. A site that sets `VELOCITY_CMS_RESEND_API_KEY` and `VELOCITY_CMS_EMAIL_FROM`, or names its own `mailer`, keeps that: it wins, and the screen says so. A change is followed by every running copy at once.
- **Storage in the editor.** Under Settings, Storage, an owner names the bucket uploads are kept in (Cloudflare R2, Amazon S3 or anything that speaks the S3 protocol) and tests it: a small file is kept there, read back and removed. The secret key is sealed and never sent back. A site on a host with no disk takes uploads as soon as a bucket is named, with no redeploy. `VELOCITY_CMS_S3_*` on the server still wins. Images uploaded to the server's disk before a bucket was named keep showing from there.
- **The site's name in the editor.** Under Settings, General, an owner says what the site is called. The editor, sign-in links, invitations and notices from forms use it; left empty, the name from `velocityCms({ siteName })` stands. A new passkey's prompt shows it after the server next starts.
- **A spam check for forms, in the editor.** Under Settings, Forms and spam, an owner pastes the two keys of a Cloudflare Turnstile widget and every form on the site asks its sender to pass it: `/cms-form.js` draws the check above the submit button, or where the form has a `[data-cms-form-challenge]`, with no change to a template. What is sent without passing is kept under Spam, never lost. The secret key is sealed and never sent back, and "Check the keys" asks Cloudflare whether it knows it. A site with a content security policy allows `https://challenges.cloudflare.com` for scripts and frames (`siteForm(...).challenge.host`). The same tab sets how many messages the forms take from one address in ten minutes (8 as before, up to 100).
- **A template's settings page lives under Settings.** A single page a template describes with `inSettings: true` (its business name, logo, contact details) is a tab of Settings and no longer listed with the content, so the menu has one Settings. Editors see that tab; the server's tabs stay with owners. When the page also says `siteNameField: 'name'`, what is published in that field is what the editor and the site's emails call the site, and the General tab's second name field is gone.
- **Changed:** `MediaService.takesUploads` is now a method that answers with a promise, since where uploads are kept can be set up while the site runs.

## 0.1.0-beta.3

- **Settings a template reads.** `single(Astro, 'settings')` answers with what a single page of the CMS holds, by field key, so a template can keep its name, logo and contact details where people edit them.
- **Many sites from one copy.** A host that runs many sites names a `SiteRegistry` in `velocityCms({ sites })`. Each request is for the site its host name belongs to, with that site's own database, secret, address and uploads; a host name the registry does not know has no site, and nothing is read from the `VELOCITY_CMS_*` settings of one site. Such a copy builds no page ahead of time: a page built for no site would be served to all of them, so every page is drawn for the site that asked. A site of its own changes nothing.
- **Uploads are kept lighter.** An uploaded image is kept as WebP, no larger than 2560 pixels on its longest side, turned the way it was taken and with nothing the camera noted (where it was taken, for one) left in it. A PNG drawing stays exact and see-through. The file that arrived is not kept. `/media/<file>?w=640` answers with a smaller copy (320, 640, 960, 1280 or 1920 wide), which the editor's lists of images now load. It uses `sharp`, which Astro installs; where it cannot be loaded, uploads are kept as before. Images uploaded earlier stay as they are.
- **Uploads of many sites in one bucket.** `S3MediaStore` takes a `prefix`, a folder inside the bucket such as `sites/s-4f2a`. A host that runs many sites gives each its own, so no site can name another's file.

## 0.1.0-beta.2

No change to the CMS itself.

- **Releases** reach npm from GitHub with no stored key: each package trusts the release workflow, and a release is public only once an owner approves it on npmjs.com.
- The README says the packages are on npm.

## 0.1.0-beta.1

The first public beta.

- **Content:** content types made in a visual builder or described in code, drafts and published versions, trash, duplicate, history with restore, scheduled publishing, preview links, several languages.
- **Pages:** a page builder of sections with the live page beside the form, pages under pages, a home page, menus edited in the CMS.
- **Media:** an image library with uploads, kept in a folder or any S3-compatible bucket.
- **Forms:** a form builder, forms as page sections, spam marking, notices by email, export and erase.
- **CRM:** contacts with a timeline and notes, a pipeline board, deals with a forecast, custom fields, CSV import.
- **Plugins:** a plugin API (version 1) with settings, secrets and retried background work. SEO and Webhooks come with it, and the experimental Mailchimp, Slack and HubSpot.
- **People:** sign-in by email link or passkey, three roles, invitations.
- **Site:** live pages cleared on publish, search and the sitemap, an option for a fully static build.
- **Install:** `npx velocity-cms init`.

Known limits are in the [README](README.md#known-limits).
