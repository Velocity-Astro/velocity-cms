# Changelog

Every package is released together under one version. While versions are `0.x`, a release may change the plugin API or the way a site describes its content. Each such change is listed here under "Changed", with how to move.

## Unreleased

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
