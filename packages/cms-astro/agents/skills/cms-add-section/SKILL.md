---
name: cms-add-section
description: Add a kind of section (a block) that editors can add to pages in Velocity CMS, such as a pricing table, a gallery or testimonials, with its fields in the model, its component built from the site's own components, the block map entry, and named looks instead of free colours. Use when asked to add a section, a block, or something editors can put on pages.
---

# Add a section editors can use

Read `.agents/cms.md` first ("Sections"). A section is data: the model describes the block and
its fields, a component draws it, and the editor only ever chooses among what you describe.

## 1. Look before you add

- Read the model's existing blocks (usually `cms/model.mjs`, a `blocks` list) and the block map
  (`export const blocks = { ... }`, usually `src/components/blocks.ts` or `src/cms/blocks.ts`).
- If an existing block differs from what is asked only in colour, alignment or image side, add a
  `select` look to it instead of a new block.
- Find the site's own components for the job (cards, grids, buttons). The section must look
  like the rest of the site.

## 2. Describe the block

```js
const pricing = {
  key: 'pricing',                        // what the component is looked up by; never change it later
  label: { en: 'Pricing' },
  description: { en: 'Two to four plans side by side, one marked as the best value.' },
  icon: 'badge-dollar-sign',             // a Lucide icon name
  group: 'Sections',
  // thumbnail: '/cms/blocks/pricing.webp', // a picture for the picker, if the site has them
  fields: [
    { key: 'title', type: 'text', label: { en: 'Title' } },
    { key: 'plans', type: 'list', label: { en: 'Plans' }, required: true, options: {
      of: { type: 'group', options: { fields: [
        { key: 'name', type: 'text', label: { en: 'Name' }, required: true },
        { key: 'price', type: 'text', label: { en: 'Price' }, required: true },
        { key: 'points', type: 'list', label: { en: 'What is included' }, options: { of: { type: 'text', options: {} } } },
        { key: 'featured', type: 'boolean', label: { en: 'Best value' } },
        { key: 'button', type: 'link', label: { en: 'Button goes to' } },
      ] } },
      min: 2, max: 4,
    } },
    { key: 'background', type: 'select', label: { en: 'Background' }, options: {
      choices: ['plain', 'tinted'],
      labels: { plain: { en: 'Plain' }, tinted: { en: 'Tinted' } },
      swatches: { plain: '#ffffff', tinted: '#f4f1ec' },
    } },
  ],
};
```

Add it to the `blocks` of every `blocks` field it belongs in (the pages type's sections field,
and a column's if it fits inside columns). Rules:

- **No free colours, sizes or classes.** A look is a `select` with named choices; `swatches`
  give the editor a sample (hex, or a CSS colour function of numbers). Use the template's own
  palette for the samples.
- Words a visitor reads are fields. Nothing is hard-coded in the component but structure.
- Keys start with a lowercase letter. Labels in every language the site has.

## 3. Write the component

Beside the others (such as `src/components/blocks/Pricing.astro`), taking the block's values as
props by key, every prop optional:

```astro
---
import { fieldMark, linkTo } from '@velocity-astro/cms-astro';
interface Plan { name?: string; price?: string; points?: string[]; featured?: boolean; button?: unknown }
interface Props { title?: string; plans?: Plan[]; background?: 'plain' | 'tinted' }
const { title, plans = [], background = 'plain' } = Astro.props;
const links = await Promise.all(plans.map((plan) => linkTo(Astro, plan.button)));
---
<section class:list={['band', background === 'tinted' && 'band--tinted']}>
  {title && <h2 {...fieldMark('title')}>{title}</h2>}
  ...draw each plan with the site's own card component, links[i]?.href for its button...
</section>
```

- Use `fieldMark('key')` on the element that shows a field, so the visual editor finds it.
- Map each look name to the site's own classes or tokens. Never put a colour from content in a
  style attribute.
- Formatted text is `{ html }`; images are names (`uploadedImage(name)`); links go through
  `linkTo`, which answers with nothing for an unpublished page.
- Valid HTML only, one `<h1>` per page (a section usually starts at `<h2>`), alt text on images.

## 4. Map it

Import the component in the block map and add `pricing: Pricing`. Then run the seed so the
block reaches the database. `npx velocity-cms type pages` shows it under the sections field.

## 5. Check

1. `npx velocity-cms check`: it fails when a block has no component or a component no block.
2. Add the section to a draft page (in the editor, or `velocity-cms` / the MCP `add_section`
   tool), open it beside the editor, and check every field shows and every look works, light
   and dark if the site has both.
3. If the site keeps pictures of blocks for the picker, take one for the new block.
