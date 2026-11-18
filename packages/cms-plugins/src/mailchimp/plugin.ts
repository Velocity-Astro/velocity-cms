import { definePlugin, liveFields, type FormDef, type Submission } from '@velocity-astro/cms-core';

/** How long Mailchimp has to answer before a try counts as failed. */
const ANSWER_WITHIN_MS = 8000;
const SUBSCRIBE = 'subscribe';

/** What is kept for one person until Mailchimp has them. Personal: the host drops it once the work is done. */
interface Subscriber {
  readonly email: string;
  readonly name?: string;
  readonly phone?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isSubscriber = (value: unknown): value is Subscriber => isRecord(value) && typeof value['email'] === 'string';
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const listOf = (value: unknown): string[] => text(value).split(',').map((part) => part.trim()).filter((part) => part !== '');

/**
 * Where a key's account lives. A Mailchimp key ends in its data centre, such as `-us21`, and
 * that is the only part of it that chooses a host: anything else in its place is refused, so a
 * key can never send a request anywhere but Mailchimp.
 */
export function mailchimpHost(key: string): string {
  const centre = /-([a-z]{2}\d{1,3})$/.exec(key.trim())?.[1];
  if (centre === undefined) throw new Error('The API key does not look like a Mailchimp key. It ends in a dash and a data centre, such as -us21. Save it again under Plugins.');
  return `${centre}.api.mailchimp.com`;
}

/** The sender as Mailchimp is told of them: the email, and the name and phone when the form marks the fields that hold them. */
function subscriberOf(form: FormDef, submission: Submission): Subscriber | undefined {
  if (submission.email === undefined) return undefined;
  const held = (id: string | undefined) => (id === undefined ? '' : text(submission.data[id]));
  const name = held(form.contact?.name);
  const phone = held(form.contact?.phone);
  return { email: submission.email, ...(name !== '' && { name }), ...(phone !== '' && { phone }) };
}

/**
 * Mailchimp: adds the people who send a form to an audience. An owner saves an API key, names
 * the audience, and may name the forms and a yes or no field that asks for consent. Each person
 * is added once: someone already in the audience, or who unsubscribed, is left as they are. One
 * that cannot be added is tried again for about a day. Built on the plugin surface alone.
 */
export const mailchimp = definePlugin({
  name: 'mailchimp',
  apiVersion: 1,
  label: { en: 'Mailchimp' },
  description: { en: 'Add the people who send your forms to a Mailchimp audience, with a confirmation email first unless you say otherwise. Experimental: tested, but not yet tried against the real service.' },
  version: '1.0.0',
  permissions: ['submission:read'],
  enabledByDefault: false,
  settings: [
    { key: 'audience', type: 'text', label: { en: 'Audience ID' }, help: { en: 'In Mailchimp: Audience, then Settings. It looks like a1b2c3d4e5.' } },
    { key: 'forms', type: 'text', label: { en: 'Forms' }, help: { en: 'The keys of the forms whose senders are added, separated by commas, such as contact, newsletter. Leave empty for every form.' } },
    {
      key: 'consentField',
      type: 'text',
      label: { en: 'Consent field' },
      help: { en: 'The key of a yes or no field on those forms, such as newsletter. With one named, only people who ticked it are added. Leave empty to add everyone who sends the form.' },
    },
    {
      key: 'skipConfirmation',
      type: 'boolean',
      label: { en: 'Add people without a confirmation email' },
      help: { en: 'Left off, Mailchimp emails each person a link to confirm before they join the audience.' },
    },
    { key: 'tags', type: 'text', label: { en: 'Tags' }, help: { en: 'Optional. Tags given to each person added, separated by commas.' } },
  ],
  secrets: [{ key: 'apiKey', label: { en: 'API key' }, help: { en: 'In Mailchimp: your profile, Extras, API keys. It ends in a dash and a data centre, such as -us21.' } }],
  setup(cms) {
    cms.tasks.define(SUBSCRIBE, async (payload) => {
      if (!isSubscriber(payload)) throw new Error('This piece of work was kept in a form this version cannot read.');
      const key = await cms.secrets.get('apiKey');
      if (key === undefined) throw new Error('No API key is saved. Save one under Plugins, then try again.');
      const settings = await cms.settings.get();
      const audience = text(settings['audience']);
      if (!/^[a-z0-9]{4,40}$/i.test(audience)) throw new Error('The audience ID is missing or is not one. Find it in Mailchimp under Audience, Settings.');
      const host = mailchimpHost(key);
      const [first, ...rest] = (payload.name ?? '').split(/\s+/).filter((part) => part !== '');
      const tags = listOf(settings['tags']);
      const member = {
        email_address: payload.email,
        status: settings['skipConfirmation'] === true ? 'subscribed' : 'pending',
        merge_fields: { ...(first !== undefined && { FNAME: first }), ...(rest.length > 0 && { LNAME: rest.join(' ') }), ...(payload.phone !== undefined && { PHONE: payload.phone }) },
        ...(tags.length > 0 && { tags }),
      };
      let answer: Response;
      try {
        // Existing members are not updated: someone who unsubscribed stays unsubscribed.
        answer = await fetch(`https://${host}/3.0/lists/${audience}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': 'Velocity-CMS-Mailchimp/1', authorization: `Basic ${btoa(`velocity:${key.trim()}`)}` },
          body: JSON.stringify({ members: [member], update_existing: false }),
          redirect: 'manual',
          signal: AbortSignal.timeout(ANSWER_WITHIN_MS),
        });
      } catch {
        throw new Error(`Mailchimp could not be reached within ${ANSWER_WITHIN_MS / 1000} seconds.`);
      }
      if (answer.status === 401 || answer.status === 403) throw new Error('Mailchimp refused the API key. Save a working one under Plugins.');
      if (answer.status === 404) throw new Error('Mailchimp has no audience with this ID. Check the audience ID in the settings.');
      if (!answer.ok) throw new Error(`Mailchimp answered ${answer.status}.`);
      const result: unknown = await answer.json().catch(() => undefined);
      const errors = isRecord(result) && Array.isArray(result['errors']) ? result['errors'].filter(isRecord) : [];
      // Already there is what was asked for. Any other refusal is said by its code alone: its words may name the person.
      const refused = errors.find((error) => error['error_code'] !== 'ERROR_CONTACT_EXISTS');
      if (refused) throw new Error(`Mailchimp did not take this address (${typeof refused['error_code'] === 'string' ? refused['error_code'] : 'no reason given'}).`);
    });

    // What looks like spam is kept in the inbox and never reaches a mailing list.
    cms.events.on('submission.received', async ({ submission, form }) => {
      if (submission.status === 'spam') return;
      const settings = await cms.settings.get();
      const forms = listOf(settings['forms']);
      if (forms.length > 0 && !forms.includes(form.key)) return;
      const consent = text(settings['consentField']);
      if (consent !== '') {
        const field = liveFields(form.fields).find((candidate) => candidate.key === consent);
        if (!field || submission.data[field.id] !== true) return;
      }
      const subscriber = subscriberOf(form, submission);
      if (subscriber) await cms.tasks.add(SUBSCRIBE, subscriber, { label: `A sender of ${form.key} to Mailchimp` });
    });
  },
});
