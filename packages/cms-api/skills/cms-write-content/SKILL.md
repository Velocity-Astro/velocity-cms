---
name: cms-write-content
description: Write, edit, translate, schedule and publish entries of a Velocity CMS site over its MCP tools - blog posts, listings, menu items, team members, case studies, site settings. Use when asked to write or update a post or an entry, change what the site says, translate content, or put something live now or at a set time.
---

# Write and publish content

Content lives in entries. Each entry belongs to a content type that says which fields it has.
What you write is a draft until it is published, and what visitors see changes only on a
publish.

## 1. Learn the type

1. `describe_site`: the content types, the site's default language, and what this connection
   may do (`mayDo`).
2. `get_content_type` for the one you will write: every field by key, its type, whether it is
   required, and the choices it offers.
3. `list_entries` of that type, then `get_entry` on one or two that are published. Match them:
   how long a title is, how a summary reads, how the body is laid out, which fields are
   filled. The site's own entries are the style guide.

A type marked `inSettings` or `sitePart` is a single page every page of the site reads (its
name, phone number, header, footer). Change it with care and say exactly what you changed.

## 2. Write

- New: `create_entry` with the type, a slug and the values by field key. The slug is the
  entry's name in its address: lowercase words joined by hyphens, short, and never changed
  once the page is live unless the person asks.
- Change: `get_entry` first, then `update_entry` with only the keys that change. A key you
  leave out stays as it is; `null` empties a field.
- Formatted text takes `{"markdown": "..."}`: headings, lists, quotes, bold, italics, code and
  links. Start body headings at the level the site's entries use; the title is a field of its
  own. Short fields, summaries and anything for search engines take a plain string.
- A long text may hold more, but only what its field's `formats` name (no `formats` means all
  of them), and only the looks its options list (`colours`, `highlights`, `callouts`, `tables`,
  `buttons`). Anything else is turned into plain paragraphs. In the markdown:
  - `<u>words</u>`, `~~words~~`, `<sup>2</sup>`, `<sub>2</sub>`.
  - `[words]{colour=brand}` and `[words]{highlight=sun}`, with a name from the field's options.
    Never a colour of your own.
  - `{align=center}` (or `right`) at the end of a paragraph or a heading.
  - `[words](entry:<type key>/<translation group>)` for a link to an entry of the site (it
    follows the entry when its address changes), and `{target=_blank rel=nofollow}` after a
    link that should open in a new tab or that search engines should not follow (`sponsored`
    for a paid one).
  - A table in GitHub's form, with `{style=<name> header=none}` on the line after it if needed.
  - Fenced code with its language, and `---` for a divider.
  - `![What it shows](porch.webp "Caption")` alone on its line for a picture of the site by
    its name, from `list_images`, with `{size=wide}` or `{size=full}` straight after it on the
    same line. A picture from elsewhere cannot be added: ask the person to upload it.
  - `> [!TIP]` (or `NOTE`, `WARNING`, `SUCCESS`, or a callout name the field lists) on the
    first line of a quote, for a callout.
  - `<details><summary>Question</summary>` on its line, the answer, then `</details>` on its
    own line, with an empty line around the answer.
  - A YouTube, Vimeo, Loom, Spotify or Google Maps address alone on its line, or
    `[What it is](address){embed}`, to show the video or map.
  - `[Book a visit](/visit/){button=primary}` for a button, with a style the field lists.
- An image field stores an image's name, from `list_images`. You cannot upload one: ask the
  person to add it in the editor (Media).
- A page built from sections is another job: use the `cms-build-page` skill.

Write only what is true. Use what the person gave you and what the site already says. Don't
invent quotes, numbers, prices, dates or names. Where a required fact is missing, ask.

## 3. Another language

`create_entry` with `translationOf` set to the original entry's id and `locale` set to the
language. It becomes the same entry in that language. Translate every field visitors read,
the slug too where the site's other translated entries do. A field marked
`sharedAcrossLanguages` holds one value for all languages: leave it out.

## 4. Check before it goes live

- `preview_link` gives a link to the entry's page showing the draft. Hand it to the person.
- `entry_history` lists every saved version. Nothing you save is lost, and a person can bring
  an earlier version back in the editor.
- Read your own draft back with `get_entry` once: a required field that is empty, or a value
  a field refused, stops a publish.

## 5. Publish, schedule, take down

Only when the person says so, and only if `mayDo` lists `entry:publish`:

- `publish_entry` puts the draft on the site at once.
- `schedule_entry` sets a time, as an ISO 8601 time with its zone. What goes out is what the
  entry holds when the time comes. Ask for the person's time zone rather than guess.
- `unpublish_entry` takes an entry off the site and keeps it as a draft.
- `trash_entry` takes it off the site and out of every list. It can be restored from the
  trash in the editor. Never trash to tidy up: ask first.

If this connection may not publish, say the draft is ready and that they can publish it in
the editor. Don't ask them for a different token.

## 6. Many entries at once

Write one, show it, and get a yes before writing the rest. Keep everything a draft, and end
with a list of what you made (title and preview link) and anything you could not fill.
