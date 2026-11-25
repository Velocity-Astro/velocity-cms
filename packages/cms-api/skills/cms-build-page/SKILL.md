---
name: cms-build-page
description: Build or change a page of a Velocity CMS site from the template's sections, over the site's MCP tools - a landing page, a service page, a new home page, or one section added, rewritten, moved or removed. Use when asked to make, redesign, lay out or edit a page, or to add something to one.
---

# Build a page from sections

A page here is a list of sections. Each section is one of the template's blocks, with that
block's own fields. You choose blocks and fill their fields; the site's own components draw
them, so the page always looks like the rest of the site. You never write markup, classes or
colours.

## 1. Learn what the page can be built from

1. `describe_site`: find the content type the page belongs to (one marked `builtFromSections`,
   usually `pages`) and what this connection may do.
2. `list_blocks` with that type: every block with its fields, its required fields and its named
   looks. Read every block's description before choosing. Do this each time: the blocks belong
   to this site and change when its template does.
3. For a page that exists, `list_entries` with its slug, then `get_sections`: the sections in
   order with their ids and values.
4. Look at a page of the site that already works (`get_sections` on the home page) to see how
   this site fills its blocks: how long a heading is, how many cards a grid holds, which looks
   it uses where.

## 2. Plan the page before writing

Say the plan to the person in one short list, section by section, before you write a long
page: which block, and what it will say. A good page:

- opens with one hero and makes one promise;
- gives each section one job, and never repeats a block back to back unless the content is a
  list of the same things;
- alternates looks (light, dark, tinted) the way the site's existing pages do, using only the
  choices a field offers;
- ends with one clear next step (a call to action or a form);
- has a single page heading: the hero's.

Use only what the person told you or what the site already says. Never invent a price, a
phone number, a testimonial, a statistic or a customer's name. Where a fact is missing, ask,
or leave the field empty and say so.

## 3. Write it

- A new page: `create_entry` with the type, a slug (lowercase words joined by hyphens;
  `services/roofing` where the type's address pattern is `/[...slug]`; `index` is the home
  page), the title, and the sections as a list of `{"block": "<key>", "data": {...}}` in the
  sections field.
- One change to a page that exists: `add_section`, `update_section`, `move_section` or
  `remove_section`, with the section's id from `get_sections`. `update_section` changes only
  the keys you name.
- A whole new order or a rebuild: `set_sections` with every section in order. Keep a section's
  `id` to keep it as it is; a section with no id is new, and one left out is removed.

Fields:

- Formatted text takes `{"markdown": "..."}`; a short field takes a plain string.
- An image field stores an image's name. `list_images` names the images the site has. You
  cannot upload one: choose from the list, or ask the person to upload it in the editor
  (Media) and name it.
- A link to a page of the site is stored as that entry, never as its address, so it follows
  the page when its address changes. Read a section that has a link (`get_sections`) to see
  the value a link takes, and `get_content_type` for what it may point to.
- A section that shows a form stores the form's id, from `list_forms`.
- A look is one of the choices its field lists. A choice that is not listed is refused.

## 4. When a tool refuses

A refusal says what is wrong and names what it would take: read it, fix the value, send it
again. Don't work around it with another block that happens to accept the text.

If no block can show the idea, don't force it into one that does not fit. Say which blocks
come closest. A new kind of section is made in the site's code, not here: `design_new_section`
gives the theme, the blocks and the steps, and the `cms-add-section` skill has each step in
full, for whoever works on the code.

## 5. Show it, then publish

Everything you write is a draft. `preview_link` gives a link to the page as it would look:
hand it to the person and ask what to change. Publish only when they say so
(`publish_entry`), and only if this connection may; otherwise tell them the draft is ready
to publish in the editor. Other people may have the page open: change the sections you were
asked about and leave the rest as they are.
