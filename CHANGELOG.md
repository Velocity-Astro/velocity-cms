# Changelog

Every package is released together under one version. While versions are `0.x`, a release may change the plugin API or the way a site describes its content. Each such change is listed here under "Changed", with how to move.

## Unreleased

## 0.1.0-beta.17

- **A calmer greeting on Home.** The greeting is on one line and your name on its own line under it, never broken across two; what is waiting ("1 draft is waiting") is a smaller line beneath. In `cms-ui`, `Welcome` takes `name` in place of `highlight`.
- **Plugin settings one click away.** Every active plugin with settings is listed in the Plugins menu and opens its settings straight away, and leaves the menu when it is switched off. A plugin's settings have an address of their own (`/admin/plugins?settings=<name>`).

## 0.1.0-beta.16

- **Branded emails.** Sign-in links, invitations, notices from forms and the test email are drawn in one polished layout: the site's logo (or its initial in its colour) above a card, a clear heading, a button that works in Outlook too, a form's answers in a panel, and a foot that names the site and says why the email came. They work in Gmail, Outlook and Apple Mail, follow dark mode where the client does, and carry the same words as plain text. A template names its logo and brand colour with `brandFields: { logo, logoDark, color }` on its settings page; the CMS serves the logo to email clients as a PNG. Without them an email wears the site's name in Velocity's orange.
- **A name on every email.** Emails no longer come from a bare address: Settings, Email has a sender name, and without one they come from the site's name (`"Lakeshore Realty" <cms@…>`). A sender the server gives with a name of its own (`VELOCITY_CMS_EMAIL_FROM="Front desk <cms@…>"`) still wins. An invitation names who sent it, and a form's notice has a button to its submissions.
- **Your profile.** Everyone can change their own name and photo and the address they sign in with (a link sent to the new address confirms it), and reach their passkeys, from "Your profile" in the account menu. An owner can rename anyone from People. A site's own mailer may add `sendEmailChange` to send the link; without it the server's or the editor's email settings send it.
- **The image library shows what you just uploaded.** Media lists the newest upload first and marks what was uploaded since the editor opened, here and in every image picker. Media has filters for where an image is from and its kind of file, and sorts by date, name or size; image pickers have a search.

## 0.1.0-beta.15

- **Analytics plugin.** An owner sets the site's Google Analytics measurement ID, Tag Manager container and cookie consent (asked first, or not at all) under Plugins, and every page follows at once, with no deploy. `pageHead` hands the ids to the layout as `analytics`, which writes the template's own tags; nothing a plugin answers is ever a script.
- **The SEO plugin holds the site's share image and its Search Console and Bing codes.** Every page carries the codes (`pageHead` answers `verification`), and a page with no picture of its own is shared with the image chosen there (`image`).
- **Redirects plugin.** An owner lists old addresses and where their pages are now. A move takes over only an address with no page, answers 308 (or 307 when it is only for now), keeps the address's query, and never leads to a script or another site over plain http. Plugins can add their own with `pages.redirect`.
- Under Plugins, a plugin that changes pages' heads is said to change what pages tell search engines, social sites and analytics (no longer only "titles and descriptions"), and one that adds redirects says so.
- Switching a plugin on or off, or saving its settings, clears the pages the site kept, so a change of title ending, codes or ids shows at once.

## 0.1.0-beta.14

- **Image fields see the folders inside the site's image folder.** `velocityCms({ images })` now lists every image under the folder, not only those at its top, so a site that keeps pictures by page or by kind (`src/assets/showcase/…`) shows them in the editor's image picker, lists and visual editor. An image is still called by its file name; where two share a name, the first by path is kept.

## 0.1.0-beta.13

- **Code in formatted text.** Words in formatted text can be set as code, from a new button of the toolbar or with backticks in Markdown (imports, MCP and the command line). A field that names its `formats` gets it only by naming `code`. A developer's blog can now be written in the editor.

## 0.1.0-beta.12

- **The column beside the rail slides open and closed.** Choosing Content (or leaving it) no longer makes the column of its places appear at once: the screen's panel slides over to make room and the column is uncovered from its edge, then the reverse on the way out. People who ask for less motion see it simply open and close. Home has no bar across the top on a tablet or larger, since it held only the search; Ctrl or Command with K still opens it.
- **Rules and skills for AI coding agents.** `velocity-cms init` now writes `.agents/cms.md`, the CMS's rules for an agent changing a site, and nine `cms-*` skills (add the CMS to a site, add a content type, a section, a form or a plugin, connect a page, import content, set up the CRM, deploy) in `.agents/skills/` and `.claude/skills/`, and points `AGENTS.md` at them. `velocity-cms agents` brings them up to date after an upgrade and leaves the site's own skills alone.
- **`velocity-cms check`** looks at a site the way a reviewer would: pages that read the CMS but are built ahead of time (directly or through their layout), a block with no component or a component with no block, a section that offers a form and never draws one, reading around the helpers, a missing secret, adapter, address or cache tag, `.env` in git, and old agent rules. Each finding names the file, the rule and the fix, and an error exits with 1.
- **Access tokens.** An owner makes one under Settings, Access tokens, or with `velocity-cms token "<what it is for>" --save`. A token acts as an editor or an author, writes drafts unless it may publish, sees contacts and submissions only when allowed, lasts up to a year and can be taken away at once. Only a hash of it is kept.
- **Content from the command line:** `velocity-cms types`, `entries`, `entry`, `create`, `update`, `publish`, `sections`, `upload`, `forms`, `submissions`, `pipeline`, `export`, and `import` from a JSON file, a Markdown file or a folder of them (front matter by field key, the text into the formatted text field, local pictures uploaded, old slugs kept).
- **An MCP server on every site,** at `/api/cms/mcp` with a token, and `velocity-cms mcp` for an agent on the same computer. Its tools read and write entries by field key, build pages from the sections the template allows (add, change, move and remove a section, refusing a block, a field or a look the template does not have), publish, schedule, preview, and work with forms, contacts, the pipeline and deals when the token may. Formatted text can be written as `{ "markdown": "..." }`. For an idea no section can show, `design_new_section` hands an agent the site's published colours and fonts, its blocks and the steps to add a new kind of section in code.
- **Search finds your content and your contacts.** The editor's search (Ctrl or Command with K) looked only at the places of the menu. It now finds entries of every type by anything they hold, such as part of an address (`4405`) or a word in a section, in any order, and, for owners and editors, contacts by name, email or phone. A content list's own search box looks at everything an entry holds too, not only its title. `GET /api/cms/entries` takes `search`, and its `type` may be left out to look across every type.
- **The editor's screen sits in a rounded panel.** From a tablet up, the navigation (the rail and the column of a section's places) sits on one dark ground that fills the window, and the bar and the screen sit in a panel with rounded corners inset from its edges, white in the light theme. Phones are unchanged.
- **A formatted text field can offer only what its place has room for.** A field names its `formats` (bold, italics, links, headings, lists, quotes), in the template's description or under "What the text can have" in the content type builder. The editor's toolbar shows only those buttons, typing or pasting cannot make anything else, and what reaches the site is limited the same way, so a heading pasted into a card's text arrives as a paragraph with its words intact. A field that names none takes them all, as before.

## 0.1.0-beta.11

- **The editor opens finished.** The Velocity mark now stays up until the first screen's content has arrived, so the editor goes from the mark straight to a full screen, never to a screen of grey shapes; those are left for moving between screens. The mark stands in a clearing of the grid with "Opening the editor" under it. Only a request that never answers is cut short, after ten seconds.

## 0.1.0-beta.10

- **The editor opens on the Velocity mark.** In place of a small spinner in the corner, the mark sits in the middle of the screen, its three facets arriving in grey and taking their colour, from the first moment the page arrives until the editor's first screen is ready, then it fades. People who ask for less motion see the mark still.
- **The visual editor is cleaner.** No more dark band round every field of the form (it was the outline that marks a field pointed at on the page, drawn even when nothing was). The page sits in a darker well between the panels, and the edges that resize them are hairlines that show on hover.
- **A small field takes the whole width of a narrow form.** A choice, a date or a number inside a section no longer squeezes into a third of the form beside the page, with its help wrapped into a thin column.
- **The SEO plugin's search preview shows only on entries that have a page of their own.** Menus, the site's settings and its theme no longer get one, and its review leaves them out too. A plugin's panel can ask for the same with `pagesOnly: true` in `register.entryPanel`.
- **Home greets you by name in the brand's colour,** as a site's own hero sets its words apart.

## 0.1.0-beta.9

- **Fixed: a page kept through the live loader alone went stale after a publish.** What `cmsLiveLoader` hands out now carries the site's own cache tag, which every publish clears (each site's own on a host for many sites).
- **The starter adds a form its model names on every deploy,** not only into an empty database. A form the site has, or moved to the trash, is left as the editor made it.
- **The starter writes the whole title a plugin gives** (the SEO plugin's title ending).
- **Colours and fonts are set in the CMS.** Two new kinds of field: a colour (typed, or picked in an area of shades and a slider of hues, or from the template's suggested palette) and a font (one of those the template offers). On a page of the settings they are part of the theme: change them under Settings, or in the visual editor's Theme card, where the page shows each change at once and nothing is kept until it is published. The starter has a Theme page with a brand colour and a headings font.
- **A guide to converting an Astro site to the CMS,** step by step, for people and for coding agents: `docs/converting-a-template.md`.
- **Fixed: the starter's Features block took more than six points.** A list's limit is now kept with what it holds.
- **One row at the top of every screen, on every window.** A screen's title (cut to fit when it is long), its state and its buttons share one row: an entry says "‹ Pages · title · Draft · Saved 3 hours ago", then undo, redo, one menu, Save draft and Publish. The language an entry is in is one button that opens the others, and Preview is in the menu. On a phone the bar is as on any phone: the way back in place of the menu, the title, the menu and Publish; a list's main button is its icon and its other buttons are in the menu. Tables leave out what can wait on a phone, and a section's tag no longer covers its buttons.
- **The visual editor is calmer.** Its frame is the editor's dark grey instead of black, Exit leaves it, and the theme is in its menu.
- **Escape closes the page's list of sections, and a dragged section goes back,** wherever the keyboard is.
- **Fixed: choosing a section did not always bring it into view on the page.** Opening the same section again, or one whose top showed at the bottom of the window, now scrolls to it.
- **Home opens on its greeting again.** The large greeting with what is waiting set apart in orange, the way to carry on and the home page beside it are back at the top of Home, which has no title in the bar above it. The cards and charts follow.
- **The visual editor is a studio.** It is dark, with Publish in the brand's orange as the one step it leads to. Its bar keeps to three groups: the way back with the page's name and state, the widths of the page as icons in the middle, and undo, redo, one menu (another language, a preview tab, schedule, history and the rest), Save draft and Publish. The sections on the left and the form on the right are dragged wider or narrower by their edges, or with the arrow keys, and stay as you left them.
- **One bar at the top of every screen.** A screen's title, what it holds and its buttons are in the bar across the top, beside the search, and the rest of the window is the screen's content. An entry's back link, state, undo and save buttons are there too, and an entry has the width to itself. The Create button in the bar is gone: each screen has its own, and Ctrl or Command with K still starts a new entry of any type.
- **Home in cards, with charts.** How many entries each kind of content has, submissions a day over the last two weeks (today in orange), and the open deals by stage, beside the recent changes, the inbox and follow-ups.
- **A list of content opens an entry with one press again.** The side pane and its live page are gone: the list has the width, and loads nothing heavy.
- **Fixed: a screen could break the first time it was opened after the site was updated.** A tab opened before an update now loads the editor afresh once instead, and a screen that cannot be drawn says so inside the frame, with a way to try again, in place of a bare error page.

## 0.1.0-beta.8

- **A new frame for the editor.** The sidebar is now a slim dark rail of sections (Home, Content, Media, then Forms, Contacts and Deals, with People, Plugins and Settings at the bottom), each with its name in a tooltip. Content opens a column that lists every kind of content, the content types and the trash; a plugin's screens are listed the same way under Plugins. A bar across the top holds the site's name and address, the search, and a Create button for a new entry of any type.
- **Home says what is waiting.** The greeting counts the drafts and unpublished changes, with a button that carries on with the latest one. Beside it is the home page as visitors see it now, which opens the visual editor. Owners and editors also see what is new from the forms and what the open deals are worth. The "Add new" buttons moved to Create in the bar.
- **A list of content shows the entry you choose beside it.** One press on a row shows that entry's page as visitors see it, where it stands, and buttons to edit it visually or open it. Enter or a second press opens it, as before. On a touch screen a tap still opens it.
- **The visual editor has three columns.** The page's sections are listed by name on the left; choosing one brings it into view and opens it in the form, which is now a panel on the right. The page sits between them.
- **A monthly target for deals.** Edit stages has a Monthly target. When one is set, Deals shows how much of it was won this month, as a bar under the totals.
- **Search, jump to or create from anywhere.** Ctrl or Command with K, or the search in the bar, opens a window that finds any place in the editor, or a new entry of any type, as you type.
- **Moving a section shows where it goes.** Dragging a section of a page by its bar now lays the page's sections out by name, one short row each: the one held follows the pointer and a thick line shows where it will land. The bar also has a Reorder button that opens the same list to stay, where a section is dragged or sent a place earlier or later until Done.

## 0.1.0-beta.7

- **Fixed: `velocity-cms init` kept the whole `cms` folder out of git.** A site's own files there, such as `cms/model.mjs`, were never committed. It now leaves out only the database (`/cms/data.db*`) and uploads (`/cms/media/`). A site set up earlier has `/cms/` in its `.gitignore`: replace that line with those two.
- `velocity-cms init` says how to start the site with the site's own package manager (`pnpm dev`, `yarn dev`), not always `npm run dev`.
- History shows saves made in one go as one row that opens, so the saves a draft makes by itself do not bury the ones that matter.
- On a phone the visual editor's bar is shorter: the widths are left out, and Preview is under the button for more.
- A section's background shows which swatch is in use before anyone has chosen one, a section's summary no longer shows a picture's file name, and the bar on a section stays under a site's own header.
- The editor shows its frame and a sign that it is loading while its script is on its way, in place of a blank page.
- A button pressed on the page (move, copy, remove, a swatch, undo) shows its result about half a second sooner.
- On Home, a single page such as Navigation is listed by its name, not as "Untitled".
- **The draft saves itself.** A few seconds after the typing pauses, in the form or on the page, an entry's draft is saved to the site and the bar says "Saved". Nothing is published by it. If it cannot be saved the bar says so, what was typed stays, and "Save draft" says why. A new entry is still made with "Save draft".
- Fixed: the page beside the form was taken away and drawn again after every save.
- The editor works on a phone and a tablet: the menu opens from a button at the top, and every screen's header, buttons and columns fold to fit.
- "Desktop" beside the form and in the visual editor shows the desktop page, whole and smaller, instead of whatever layout fits the pane. The buttons on the page stay their own size. On a phone the page is tried as a phone shows it.
- **Home leads to the home page.** The editor's first screen has "Edit the home page", which opens the page at the top of the site in the visual editor, and "View the site". In a list of pages the home page comes first and is marked "Home page", whatever its title says. An entry's menu has "View on the site" once it is published.
- **The visual editor is part of the address.** A reload stays in it, the browser's Back button leads from it to the form, and the entry's other language opens the same way. Before, a reload dropped to the form and Back left the entry.
- **Ctrl or Command with S saves the draft**, from the form and from the page, in place of the browser's own "save this page as a file".
- **Fixed: a save with no connection spun for ever.** A request made while the browser was offline was held back in silence, with its button busy. It now fails at once, says the server could not be reached, and can be tried again.
- **Fixed: a list stopped at 200 without saying so.** A type with more than 200 entries (100 in two languages), and the lists of contacts, deals, submissions and the trash, showed the first 200 as if they were all. Every list is now read to its end, and its search looks through all of it.
- **Fixed: "Skip to content" left the screen.** The link the keyboard reaches first sent the person to the editor's first screen. It now moves the keyboard to the screen's content, where they are.
- **One bar for everything on the page.** Change image, Edit link and the buttons of a list's item (earlier, later, duplicate, remove) were small buttons floating beside the thing they were for, which overlapped one another and went away before the pointer reached them. They are now on the section's own bar, beside move, duplicate, remove, a new button that adds a section and the swatches, and the thing they are about is outlined. The bar stays as the pointer travels to it, turns to another thing only when the pointer rests on it or presses it, and is still on the same item after a button is pressed, so an item can be moved twice without moving the pointer. A line along each edge of the section holds the button that adds a section there.
- **Fixed: the page jumped to the top when something far down it was changed.** A swatch pressed on a section's bar, an undo, a picture or anything else that draws the page again could scroll it to the section last opened in the form. A page drawn again now stays exactly where it was: it holds its place by the section in view, even when something above is taller or shorter than before, it is not shown until it is back in place, and a template's fade between pages is not played for it. Only a section just moved or added is brought into view.
- **Sections inside a section.** A block can hold sections of its own in named places: the columns of a row, each built from a few small blocks. Give the block a field of type `blocks` for each place. In the form a place is a list of sections like the page's own. On the page, each inner section has its bar (move, duplicate, remove, add beside it) and its words, pictures and links are edited in place; an empty place has an "Add section" button; and a section can be dragged from one place to another that takes the same blocks. A template says where a place is with `slotMark(section.id, 'left')`, beside `sectionMark` on each inner section.
- **Theme.** The visual editor has a Theme button where the template's settings hold looks to choose, such as its colour presets. The site's colours are tried on the page as they are chosen, and "Publish theme" publishes them for the whole site. They are the same fields Settings shows, now as swatches.
- **Section swatches.** A choice among a few of the template's own colours, such as a section's background, is shown as swatches: in the form as a row of named colours, and on the page as dots on the section's bar, where one press changes the section. A template gives a `select` field's choices their sample colours with `swatches`; what is stored is still the choice's name.
- **Undo and redo.** An entry's bar has Undo and Redo buttons, and Ctrl or Command with Z (with Shift, or Ctrl with Y, to redo) works in the form, in the visual editor and on the page itself. A step is whatever was last changed: words typed in a field, a section moved, added or removed, a picture or a link changed. Steps are kept while the entry is open, across saves.
- **Write formatted text on the page.** In the visual editor and beside the form, text with paragraphs, bold and links is written right where the page shows it. Choosing words there shows a small bar with bold, italic and link. What is pasted goes in as plain words, and only what the format keeps is saved.
- **Move, duplicate and remove a card from the page.** In the visual editor and beside the form, an item of a list in a section (a card, a row of a menu, a line of a checklist) shows a small bar while the pointer is in it: earlier, later, duplicate, remove. A copy can be typed over right there. A template needs no change.
- **Edit a link or a button from the page.** In the visual editor and beside the form, a button or a link of a section shows an "Edit link" button while the pointer is over it. It opens a window with the link's own field: a page of the site chosen by name, or an address. A template needs no change, as long as its blocks ask `linkTo` where a link leads.
- **Change a picture from the page.** In the visual editor and beside the form, a picture of a section shows a "Change image" button while the pointer is over it. It opens the same window the field in the form does, to choose one of the site's images or upload a new one, and the page shows it at once. Pictures inside a list (a team, a row of cards) work the same way. Nothing is asked of a template.

## 0.1.0-beta.6

- **A picture of each kind of section.** A block can name a picture of itself (`defineBlock({ thumbnail: '/cms/blocks/text.webp' })`, a file in the site's `public` folder), and "Add a section" then shows its kinds as cards with their pictures in place of a list of names. A block with no picture shows its icon in the same frame, and a site whose blocks have none keeps the list.
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
