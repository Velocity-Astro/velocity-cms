---
name: cms-write-plugin
description: Connect Velocity CMS to another service or add to its editor with a plugin (send leads to a dispatch system, sync to a CRM, add a reading-time panel), after checking the plugins that ship. Fewest permissions, secrets kept as secrets, outside calls through cms.tasks. Use when asked to integrate, sync, send data somewhere, add a webhook or extend the editor.
---

# Write a plugin or an integration

Read `.agents/cms.md` first ("Plugins").

## 1. Use what ships first

The CMS ships plugins an owner switches on under Plugins, with no code:

- **Webhooks**: posts what happens (a form sent, a contact or deal changed, a page published) to
  addresses the owner lists, signed. Most "send X to our system" requests are this.
- **Mailchimp**: adds whoever sends a form to an audience, with consent.
- **Slack**: posts to a channel when a form is sent or a contact is made.
- **HubSpot**: copies contacts to HubSpot.
- **SEO**: judges each page's title and description.

If one fits, tell the person how to switch it on and fill its settings. Stop there.

## 2. Otherwise, write one

A file in the site (such as `cms/plugins/dispatch.mjs`) named in
`velocityCms({ plugins: ['./cms/plugins/dispatch.mjs'] })`:

```js
import { definePlugin } from '@velocity-astro/cms-astro';

export default definePlugin({
  name: 'dispatch',                         // lowercase, unique
  apiVersion: 1,
  label: { en: 'Dispatch' },
  version: '1.0.0',
  permissions: ['submission:read'],         // the fewest it needs; personal data only if it must
  enabledByDefault: false,
  settings: [{ key: 'form', type: 'text', label: { en: 'Form key to send' } }],
  secrets: [{ key: 'apiKey', label: { en: 'API key' } }],   // never a setting
  setup(cms) {
    cms.tasks.define('send', async (lead, task) => {
      const key = await cms.secrets.get('apiKey');
      if (!key) return;
      const response = await fetch('https://api.dispatch.example/leads', {
        method: 'POST',
        // A piece of work may run twice: the id lets the other side tell.
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'idempotency-key': task.id },
        body: JSON.stringify(lead),
      });
      if (!response.ok) throw new Error(`Dispatch answered ${response.status}`);   // the host retries
    });
    cms.events.on('submission.received', async ({ form, submission }) => {
      const { form: wanted } = await cms.settings.get();   // settings by key; submission.data is by field id
      if (form.key === wanted) await cms.tasks.add('send', { form: form.key, data: submission.data }, { label: 'New lead' });
    });
  },
});
```

Check the exact names against `PluginContext` in `@velocity-astro/cms-core` (`plugin.ts`) before
relying on them; they are a promise to plugin authors, so they change only with `apiVersion`.

Rules:

- **Fewest permissions.** A plugin hears of a submission only if it declared `submission:read`.
- **A key is a secret** (`secrets`), saved by an owner one at a time, never shown again, read
  only by `cms.secrets.get`.
- **Outside calls go through `cms.tasks`**, which retries for about a day and shows failures
  under Plugins. A task's data may be personal: never log it, and keep errors to the host and
  status, never the body.
- **Only public `https` addresses.** A host a person typed is checked with `cms.net.isPublic`.
- A plugin's failure never stops a save or a publish; don't catch and hide errors to "help".
- To change a page's head, use `pages.head` rules and call `pages.changed()`; nothing else of a
  page is a plugin's.
- An editor part (`editor`) is one prebuilt module that builds only from the parts it is handed.

## 3. Check

Build, start the dev server, switch the plugin on under Plugins, fill its settings and secret,
and make it happen (send the form). Look under Plugins for its tasks. Run `npx velocity-cms check`.
Tell the person which secret they must paste in themselves.
