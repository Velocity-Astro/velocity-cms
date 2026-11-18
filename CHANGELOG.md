# Changelog

Every package is released together under one version. While versions are `0.x`, a release may change the plugin API or the way a site describes its content. Each such change is listed here under "Changed", with how to move.

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
