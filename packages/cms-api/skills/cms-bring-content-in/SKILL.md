---
name: cms-bring-content-in
description: Bring existing content into a Velocity CMS site over its MCP tools, from text, a document, a spreadsheet or pages the person shares in the conversation - posts, products, listings, team members, FAQs. Use when asked to import, migrate, move, copy over or bulk add content to the site.
---

# Bring content in

The job is to turn what the person already has into entries of the site's content types, as
drafts they can check, without losing or inventing anything.

## 1. Look at both sides

- What they have: read all of it before writing any. Count the items and say the number.
- What the site takes: `describe_site`, then `get_content_type` for the type it belongs in.
  Note the required fields and the fields with choices.
- What is there already: `list_entries` of that type, so nothing is added twice. An entry
  with the same slug or title exists already: ask whether to update it or leave it.

If nothing fits the content (no type for it, or a field it needs is missing), stop and say
so. A content type is made by a person in the editor (Content types) or in the site's code;
it cannot be made here.

## 2. Agree the map

Show a small table before writing: each piece of their content, the field it goes to, and
what happens to anything with no field. Settle these with the person:

- which value becomes the title, and how slugs are made (from the old address where there is
  one, so old links can be kept);
- dates, and their time zone;
- how categories or tags map onto the choices a field offers. A value that is not one of the
  choices is refused: map it or leave it out, never force it;
- which language each item is in.

## 3. Bring in one, then the rest

1. `create_entry` for one item, as a draft. Show its `preview_link` and get a yes.
2. Then the rest, one `create_entry` each, all drafts. Formatted text goes in as
   `{"markdown": "..."}`: keep headings, lists, links, bold and quotes, and drop styling the
   site does not use.
3. When one is refused, read why, fix that item and go on. Keep a list of what could not be
   brought in and why; don't stop the whole job for one item.

Keep their words. Fix nothing but obvious formatting unless asked: no rewriting, no
summaries in place of the text, no filling an empty field with something plausible.

## 4. Pictures

An image field stores an image's name, and these tools cannot upload. `list_images` names
what the site has. For pictures that are not there, bring the entries in without them and
give the person a list of which entry needs which picture, to add in the editor (Media).
With the site's code and a terminal, `npx velocity-cms import` brings pictures in too.

## 5. Old addresses

Where content had an address before, list old address and new address side by side. The
Redirects plugin (Plugins, in the editor) sends visitors from the old to the new: an owner
turns it on and pastes the list.

## 6. Hand over

End with: how many were brought in, how many were left out and why, what still needs a
picture or a decision, and that everything is a draft. Publish only when the person says so
and this connection may. For hundreds of entries, publish a few, let them look at the live
pages, then publish the rest.
