import { definePlugin, type Contact } from '@velocity-astro/cms-core';

/** How long HubSpot has to answer before a try counts as failed. */
const ANSWER_WITHIN_MS = 8000;
const UPSERT = 'upsert';
/** The one address this plugin sends to. Nothing an owner types can change it. */
export const HUBSPOT_UPSERT = 'https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert';
/** The stages HubSpot has for a new person. Anything else typed into the setting is left out. */
const LIFECYCLE_STAGES: ReadonlySet<string> = new Set(['subscriber', 'lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer', 'evangelist', 'other']);

/** What is kept for one person until HubSpot has them. Personal: the host drops it once the work is done. */
interface Person {
  readonly email: string;
  readonly name?: string;
  readonly phone?: string;
  /** Whether the contact was just made, which is when a lifecycle stage is given. */
  readonly isNew: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isPerson = (value: unknown): value is Person => isRecord(value) && typeof value['email'] === 'string';
const personOf = (contact: Contact): Person => ({
  email: contact.email,
  ...(contact.name !== undefined && { name: contact.name }),
  ...(contact.phone !== undefined && { phone: contact.phone }),
  isNew: contact.revision === 1,
});

/**
 * HubSpot: keeps a copy of the site's contacts in HubSpot. A contact made here, by a form or by
 * hand, is made there, matched by email, and a change to the name or phone follows. It goes one
 * way: nothing is read from HubSpot, and erasing a contact here does not erase it there. One
 * that cannot be sent is tried again for about a day. Built on the plugin surface alone.
 */
export const hubspot = definePlugin({
  name: 'hubspot',
  apiVersion: 1,
  label: { en: 'HubSpot' },
  description: { en: 'Copy your contacts to HubSpot as they are made and changed, matched by email. Experimental: tested, but not yet tried against the real service.' },
  version: '1.0.0',
  permissions: ['contact:read'],
  enabledByDefault: false,
  settings: [
    {
      key: 'lifecycleStage',
      type: 'text',
      label: { en: 'Lifecycle stage for new contacts' },
      help: { en: 'Optional. One of HubSpot\'s own, written as HubSpot names it: subscriber, lead, marketingqualifiedlead, salesqualifiedlead, opportunity, customer. Leave empty to let HubSpot decide.' },
    },
    { key: 'onlyNew', type: 'boolean', label: { en: 'Send new contacts only' }, help: { en: 'Left off, a change to a contact\'s name or phone here is sent to HubSpot too.' } },
  ],
  secrets: [
    {
      key: 'accessToken',
      label: { en: 'Private app access token' },
      help: { en: 'In HubSpot: Settings, Integrations, Private Apps. Create an app that may write contacts (crm.objects.contacts.write) and copy its token.' },
    },
  ],
  setup(cms) {
    cms.tasks.define(UPSERT, async (payload) => {
      if (!isPerson(payload)) throw new Error('This piece of work was kept in a form this version cannot read.');
      const token = await cms.secrets.get('accessToken');
      if (token === undefined) throw new Error('No access token is saved. Save one under Plugins, then try again.');
      const settings = await cms.settings.get();
      const stage = typeof settings['lifecycleStage'] === 'string' ? settings['lifecycleStage'].trim().toLowerCase() : '';
      const [first, ...rest] = (payload.name ?? '').split(/\s+/).filter((part) => part !== '');
      const properties = {
        email: payload.email,
        ...(first !== undefined && { firstname: first }),
        ...(rest.length > 0 && { lastname: rest.join(' ') }),
        ...(payload.phone !== undefined && { phone: payload.phone }),
        ...(payload.isNew && LIFECYCLE_STAGES.has(stage) && { lifecyclestage: stage }),
      };
      let answer: Response;
      try {
        answer = await fetch(HUBSPOT_UPSERT, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': 'Velocity-CMS-HubSpot/1', authorization: `Bearer ${token.trim()}` },
          body: JSON.stringify({ inputs: [{ id: payload.email, idProperty: 'email', properties }] }),
          redirect: 'manual',
          signal: AbortSignal.timeout(ANSWER_WITHIN_MS),
        });
      } catch {
        throw new Error(`HubSpot could not be reached within ${ANSWER_WITHIN_MS / 1000} seconds.`);
      }
      if (answer.status === 401) throw new Error('HubSpot refused the access token. Save a working one under Plugins.');
      if (answer.status === 403) throw new Error('The access token may not write contacts. Give the private app crm.objects.contacts.write in HubSpot.');
      // A 207 says some of what was sent was refused, and one person was sent. Why is not repeated: its words may name them.
      if (!answer.ok || answer.status === 207) throw new Error(`HubSpot answered ${answer.status} and did not take this contact.`);
    });

    cms.events.on('contact.saved', async ({ contact }) => {
      if (contact.revision !== 1 && (await cms.settings.get())['onlyNew'] === true) return;
      await cms.tasks.add(UPSERT, personOf(contact), { label: contact.revision === 1 ? 'A new contact, to HubSpot' : 'A changed contact, to HubSpot' });
    });
  },
});
