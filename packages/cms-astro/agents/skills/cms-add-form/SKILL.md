---
name: cms-add-form
description: Build a form on a Velocity CMS site that feeds the built-in CRM (contact, quote, tour request, booking), keeping the template's own design (steps, toggles, pickers), posting through siteForm, naming the sender's name, email and phone, filling custom fields and starting deals. Use when asked to build or connect a form, make the contact form work, or send leads to the CRM.
---

# Build a form that feeds the CRM

Read `.agents/cms.md` first ("Forms"). On a site with the CMS, forms are CMS forms: what is
sent is kept under Forms in the editor, the people named are emailed, and the sender becomes a
contact. Don't wire an Astro Action or a third-party form service for it.

## 1. Describe the form

Look at the design first: every field, step, toggle and picker. Each answer a visitor gives is a
field of a kind they can fill in: `text` (`multiline`, `maxLength`), `email`, `phone`, `number`,
`date`, `select` (`choices`, `labels`), `boolean`, `url`.

```js
// in the seed's forms, added only when the site has no form with this key
{
  key: 'tour',
  label: { en: 'Schedule a tour' },
  fields: [
    { key: 'name', type: 'text', label: { en: 'Your name' }, required: true, options: { maxLength: 80 } },
    { key: 'email', type: 'email', label: { en: 'Email' }, required: true },
    { key: 'phone', type: 'phone', label: { en: 'Phone' } },
    { key: 'day', type: 'date', label: { en: 'Preferred day' } },
    { key: 'time', type: 'select', label: { en: 'Time' }, options: { choices: ['morning', 'afternoon'], labels: { morning: { en: 'Morning' }, afternoon: { en: 'Afternoon' } } } },
    { key: 'virtual', type: 'boolean', label: { en: 'A video tour is fine' } },
  ],
  submitLabel: { en: 'Request a tour' },
  success: { en: 'Thanks. We will confirm your tour by email.' },
  contact: { name: 'name', email: 'email', phone: 'phone' },   // what makes the sender a contact
  startsDeal: true,                                          // on a listing's page: a deal about the listing
  retentionDays: 365,
}
```

- `contact` is what ties a submission to a person. Without an email field named there, nobody
  becomes a contact.
- `startsDeal` needs the page's type to have `forDeals: true`.
- `fills` maps a form field's key to a contact custom field's id (see `cms-set-up-crm`).
- `notify` lists who is emailed. Ask the person for the addresses; never invent them.
- On a live site, `create_form` (MCP) makes the form without a deploy. Once a form exists it is
  the editor's: change it there, not in the seed.

## 2. Draw it with the template's design

In the component (a block with a `form` field, or a fixed place on a page):

```astro
---
import { FORM_SCRIPT, siteForm } from '@velocity-astro/cms-astro';
const form = await siteForm(Astro, 'tour');        // or siteForm(Astro, { id }) from a form field
---
{form && (
  <form action={form.action} method="post" data-cms-form data-cms-form-failed="That could not be sent. Please try again.">
    {Object.entries(form.hidden).map(([name, value]) => <input type="hidden" name={name} value={value} />)}
    ...the template's own markup, each input named by its field's key...
    <p data-cms-form-error="email" role="alert" hidden></p>
    <div class="trap" aria-hidden="true"><input type="text" name={form.trap} tabindex="-1" autocomplete="off" /></div>
    <button type="submit" data-cms-form-sending="Sending…">Request a tour</button>
    <p role="status" data-cms-form-status hidden></p>
  </form>
)}
<script is:inline type="module" src={FORM_SCRIPT}></script>
```

- Keep steps, toggles and pickers: they are presentation. What is posted is one value per field
  key (a toggle posts `on`, a day picker posts `YYYY-MM-DD`).
- On an entry's page, `siteForm(Astro, 'tour', { about })` says which entry it is about, signed,
  so a deal can be started about it. Never trust a hidden field the visitor could change for that.
- A form that is closed or gone answers `null`: leave the section out, never break the page.
- A page that draws a form says `export const prerender = false`.

## 3. Never

- Never put what a visitor sent on a page, in a log, in a cache or in a commit.
- Never email the visitor; only the addresses the form names.

## 4. Check

`npx velocity-cms check` (it fails when a section offers a form its component never draws).
Then send the form on the dev server and look under Forms and Contacts in `/admin`. Tell the
person email notices need a mail service (Settings, Email).
