---
name: cms-set-up-crm
description: Set up the built-in CRM of a Velocity CMS site: name the pipeline's stages, add custom fields to contacts and deals, say who gets new contacts, set a monthly target, mark which content types deals can be about, and connect forms to it. Use when asked to set up a sales pipeline, the CRM, deals, lead stages or lead routing.
---

# Set up the CRM

Read `.agents/cms.md` first. The CRM is part of the CMS: whoever sends a form becomes a contact,
contacts move through the pipeline's stages, and deals are what a contact may buy. It is
personal data, so this skill needs a token allowed to read contacts and forms.

## 1. Get access

An owner makes a token in the editor (Settings, Access tokens) with "May read contacts, deals and
what forms received" ticked, or `npx velocity-cms token "CRM setup" --personal-data --save` on a
computer with the site's database. Put it in `VELOCITY_CMS_TOKEN`. The MCP tools below are the
same over `npx velocity-cms mcp` or the site's `/api/cms/mcp`.

## 2. Ask the person

Don't guess a sales process. Ask, and confirm before saving:

- the stages a lead goes through, in order, and which mean won or lost (for example: New,
  Contacted, Tour booked, Offer, Won, Lost), with how likely an open stage is to close;
- the currency, and a monthly target if they track one;
- who on the team looks after new contacts (`list_team`); new contacts go to whoever of them
  has the fewest;
- what else they note about a contact or a deal (budget, source, move-in date).

## 3. Save it

1. `get_pipeline`, then `save_pipeline` with every stage in order. Keep the `id` of a stage that
   stays, so contacts stay in it; a stage left out is removed and its contacts move to the first.
   Labels may be left out for the stages the CMS came with.
2. `get_custom_fields`, then `save_custom_fields` with the whole list for contacts and for deals.
   Keep each field's `id`. Kinds: `text`, `email`, `phone`, `number`, `date`, `select`,
   `boolean`, `url`. None can be required.
3. Deals about the site's content (a listing, a service): set `forDeals: true` on that content
   type in the model and run the seed. A form on its pages with `startsDeal: true` then starts a
   deal about the entry.
4. Forms: make sure each form names `contact` (`name`, `email`, `phone` keys) and, where an answer
   belongs on the contact, `fills` (form field key to the custom field's id). See `cms-add-form`.

## 4. Never

- Never copy contacts, deals or submissions into a file in the repository, a log, or a page.
- Never import contacts without the person's say-so; when they give a file, the editor's
  Contacts screen imports CSV, and `create_contact` adds one at a time.

## 5. Check

`get_pipeline` and `get_custom_fields` read back what you saved. Send a form on the dev server and
look at Contacts in `/admin`: the sender is there, in the first stage, given to someone.
