# Changelog

Every package is released together under one version. While versions are `0.x`, a release may change the plugin API or the way a site describes its content. Each such change is listed here under "Changed", with how to move.

## Unreleased

- **What the editor draws on a page is Velocity orange.** The outlines, the "Add section" buttons and the line that shows where a dragged section lands were the browser's blue.
- **Fixed: the page beside the form could run an old script for an hour after an upgrade.** A browser kept `/cms-preview.js` for an hour, so something new on the page (a section's bar, for one) did not show until then. It is now asked for each time.
- **Drag a section on the page.** A section's bar on the page has a grip: drag it and a line shows where the section would land, between the others, and the page scrolls when the pointer nears its top or bottom. Letting go moves it, exactly as dragging it in the form's list does. Escape puts it back.
- **A section's own bar on the page.** In the visual editor and beside the form, the section the pointer is in shows a small bar with its name and four buttons: move up, move down, duplicate and remove. A button at its top and bottom edge adds a section right there, chosen from the same list as in the form. The page changes nothing itself: each button does what the same button in the form does, so a removal still asks first and everything waits for Save or Publish. Nothing is asked of a template.
- **The Visual editor button is where the note was.** The line "The form as it is now, saved or not" above the page is gone, and the button that opens the visual editor sits in its place.

## 0.1.0-beta.5

- **The visual editor: the page in the whole window.** Beside the form, "Visual editor" gives the page the whole window, over the editor's own frame, with one bar across the top: the way back, where the page stands, the widths to try it at, and Save draft and Publish. Words are typed straight on the page as before. A click on a section, a picture or anything else that is edited in the form slides the form in at the side, open at that section, and it slides away again from the bar. Nothing is drawn anew and nothing typed is lost on the way in or out.
- **Type on the page.** Beside the form, a click on a heading, a line of text or an item of a list puts the caret there, and what is typed goes into the form as it is typed, with no wait for the page to be drawn again. Only plain words can be typed this way, and only the words: a heading's second colour, an icon in a button and the layout stay as the template made them. Enter ends it and Escape puts back what was there. It needs `sectionMark(section.id, section.data)` and nothing else from a template. The starter's blocks no longer mark their fields by hand.
- **A click on the page finds the field with no mark on it.** `sectionMark(section.id, section.data)` now tells the page beside the form what the section holds, and each field is found by the words or the picture it shows, so a template whose blocks hand their words to components of its own needs only that one line. `fieldMark` is for what cannot be found that way (a value the block changes before it shows it), and a mark a template wrote always comes first. Nothing is added to a visitor's page.
- **A click on the page finds the field, not only the section.** Beside the form, the page now outlines what the pointer is over and what is chosen, in a layer above the page that changes nothing of the template's own markup. A template that marks its fields (`fieldMark('title')`, beside `sectionMark(section.id)`, both from `@velocity-astro/cms-astro`) has a click on a heading, a paragraph or a card open its section and point at that field in the form. A template with no field marks works as before. The section open in the form is outlined on the page, and the page no longer jumps to it when it is already in view.

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
