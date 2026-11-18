import { ValidationError, definePlugin, liveFields, type Contact, type Deal, type Entry, type FormDef, type PluginContext, type Submission } from '@velocity/cms-core';

/** How long the other side has to answer before a try counts as failed. */
const ANSWER_WITHIN_MS = 5000;
const SEND = 'send';

/** The groups of events an address can ask for, as the settings name them. */
const GROUPS = ['submissions', 'contacts', 'deals', 'published'] as const;
type Group = (typeof GROUPS)[number];

/** What is kept for one delivery until it has been made. */
interface Delivery {
  readonly url: string;
  readonly event: string;
  readonly at: string;
  readonly data: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isDelivery = (value: unknown): value is Delivery => isRecord(value) && typeof value['url'] === 'string' && typeof value['event'] === 'string' && typeof value['at'] === 'string';
const toHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * The address as it may be sent to, or why it may not. Only `https`, and never this machine or a
 * bare number: an address typed into settings must not become a way to reach what sits beside
 * the site.
 */
export function deliveryAddress(text: string): URL {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ValidationError(`"${text}" is not an address. Write it in full, such as https://example.com/hooks/velocity.`, [{ path: ['endpoints'], message: 'Not an address.' }]);
  }
  const host = url.hostname.toLowerCase();
  const refuse = (why: string) => new ValidationError(`Nothing is sent to ${url.host}: ${why}`, [{ path: ['endpoints'], message: why }]);
  if (url.protocol !== 'https:') throw refuse('the address must start with https://.');
  if (url.username !== '' || url.password !== '') throw refuse('the address must not hold a name or a password. Use the signing secret instead.');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[')) {
    throw refuse('it must be a public address with a name, not this machine or a number.');
  }
  return url;
}

/** The addresses the owner listed, with the groups each asked for. One that ticked none gets everything. */
async function endpointsOf(cms: PluginContext): Promise<{ url: string; groups: readonly Group[] }[]> {
  const { endpoints } = await cms.settings.get();
  if (!Array.isArray(endpoints)) return [];
  return endpoints.filter(isRecord).flatMap((endpoint) => {
    const url = typeof endpoint['url'] === 'string' ? endpoint['url'].trim() : '';
    const ticked = GROUPS.filter((group) => endpoint[group] === true);
    return url === '' ? [] : [{ url, groups: ticked.length > 0 ? ticked : GROUPS }];
  });
}

/** What a visitor sent, by field key, with the form it came through. */
function submissionData(form: FormDef, submission: Submission) {
  const fields = Object.fromEntries(liveFields(form.fields).flatMap((field) => (submission.data[field.id] === undefined ? [] : [[field.key, submission.data[field.id]]])));
  return {
    form: { id: form.id, key: form.key, label: form.label },
    submission: { id: submission.id, createdAt: submission.createdAt, ...(submission.email !== undefined && { email: submission.email }), ...(submission.page !== undefined && { page: submission.page }), ...(submission.locale !== undefined && { locale: submission.locale }), fields },
  };
}

const contactData = ({ revision: _revision, ...contact }: Contact) => ({ contact });
const dealData = ({ revision: _revision, ...deal }: Deal) => ({ deal });

/**
 * Webhooks: tells other services what happens on the site, as it happens. Each address an owner
 * lists is sent a small JSON message when a form is submitted, a contact or a deal changes, or a
 * page is published. A message that cannot be delivered is tried again for about a day, and the
 * owner sees each one under Plugins. Built on the plugin surface alone.
 */
export const webhooks = definePlugin({
  name: 'webhooks',
  apiVersion: 1,
  label: { en: 'Webhooks' },
  description: { en: 'Send form submissions, contacts, deals and published pages to any other service: Zapier, Make, n8n or your own code. Failed deliveries are tried again.' },
  version: '1.0.0',
  permissions: ['entry:read', 'submission:read', 'contact:read'],
  enabledByDefault: false,
  settings: [
    {
      key: 'endpoints',
      type: 'list',
      label: { en: 'Addresses' },
      help: { en: 'Where messages are sent. Each must start with https://. Tick what an address should hear of, or tick nothing to send it everything.' },
      options: {
        max: 10,
        of: {
          type: 'group',
          options: {
            fields: [
              { key: 'url', type: 'url', label: { en: 'Address' }, required: true },
              { key: 'submissions', type: 'boolean', label: { en: 'Form submissions' } },
              { key: 'contacts', type: 'boolean', label: { en: 'Contacts' } },
              { key: 'deals', type: 'boolean', label: { en: 'Deals' } },
              { key: 'published', type: 'boolean', label: { en: 'Pages published and unpublished' } },
            ],
          },
        },
      },
    },
  ],
  secrets: [
    {
      key: 'signingSecret',
      label: { en: 'Signing secret' },
      help: { en: 'Optional. With one saved, every message carries an X-Velocity-Signature header (sha256= and the HMAC of the body), so the other side can check it came from this site.' },
    },
  ],
  setup(cms) {
    cms.tasks.define(SEND, async (payload, task) => {
      if (!isDelivery(payload)) throw new Error('This delivery was kept in a form this version cannot read.');
      const url = deliveryAddress(payload.url);
      const body = JSON.stringify({ id: task.id, event: payload.event, createdAt: payload.at, data: payload.data });
      const secret = await cms.secrets.get('signingSecret');
      const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'Velocity-CMS-Webhooks/1', 'x-velocity-event': payload.event, 'x-velocity-delivery': task.id };
      if (secret !== undefined) {
        const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        headers['x-velocity-signature'] = `sha256=${toHex(new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))))}`;
      }
      let answer: Response;
      try {
        // A redirect is not followed: it could lead where the address itself may not.
        answer = await fetch(url, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(ANSWER_WITHIN_MS) });
      } catch {
        // Why it failed can hold the address's query, which may be a key: only the host is said.
        throw new Error(`${url.host} could not be reached within ${ANSWER_WITHIN_MS / 1000} seconds.`);
      }
      if (!answer.ok) throw new Error(`${url.host} answered ${answer.status}. It must answer 2xx to accept a message.`);
    });

    /** Asks for one delivery to each address that wants this group. An address that may not be sent to is a fault, said under Plugins. */
    const tell = async (group: Group, event: string, data: unknown) => {
      const at = new Date().toISOString();
      let refused: unknown;
      for (const endpoint of await endpointsOf(cms)) {
        if (!endpoint.groups.includes(group)) continue;
        try {
          const { host } = deliveryAddress(endpoint.url);
          const delivery: Delivery = { url: endpoint.url, event, at, data };
          await cms.tasks.add(SEND, delivery, { label: `${event} to ${host}` });
        } catch (error) {
          refused ??= error;
        }
      }
      if (refused !== undefined) throw refused;
    };

    /** An entry as other services know it: by the key of its type and its address part. */
    const entryData = async (entry: Entry) => {
      const type = await cms.schema.get(entry.typeId);
      return { entry: { id: entry.id, type: type.key, locale: entry.locale, slug: entry.published?.slug ?? entry.slug, updatedAt: entry.updatedAt } };
    };

    // What looks like spam is kept in the inbox and told to nobody else.
    cms.events.on('submission.received', ({ submission, form }) => (submission.status === 'spam' ? undefined : tell('submissions', 'submission.received', submissionData(form, submission))));
    cms.events.on('contact.saved', ({ contact }) => tell('contacts', 'contact.saved', contactData(contact)));
    // Someone who was forgotten: the other side is told who, so it can forget them too.
    cms.events.on('contact.deleted', ({ contact }) => tell('contacts', 'contact.deleted', { contact: { id: contact.id, email: contact.email } }));
    cms.events.on('deal.saved', ({ deal }) => tell('deals', 'deal.saved', dealData(deal)));
    cms.events.on('deal.deleted', ({ deal }) => tell('deals', 'deal.deleted', { deal: { id: deal.id, contactId: deal.contactId } }));
    cms.events.on('entry.published', async ({ entry }) => tell('published', 'entry.published', await entryData(entry)));
    cms.events.on('entry.unpublished', async ({ entry }) => tell('published', 'entry.unpublished', await entryData(entry)));
  },
});
