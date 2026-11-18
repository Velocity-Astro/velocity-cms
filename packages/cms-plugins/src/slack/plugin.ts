import { definePlugin } from '@velocity-astro/cms-core';

/** How long Slack has to answer before a try counts as failed. */
const ANSWER_WITHIN_MS = 5000;
const POST = 'post';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
/** What a person typed, made safe to stand in a Slack message: it can start no link, mention or formatting of its own. */
const plain = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[*_~`]/g, '').slice(0, 200);

/**
 * The address Slack gave for a channel, or why it is not one. Only Slack's own host for incoming
 * webhooks is posted to, so what is saved here can never send a message anywhere else.
 */
export function slackAddress(text: string): URL {
  let url: URL | undefined;
  try {
    url = new URL(text.trim());
  } catch {
    url = undefined;
  }
  if (!url || url.protocol !== 'https:' || url.hostname !== 'hooks.slack.com' || url.port !== '' || url.username !== '' || !url.pathname.startsWith('/services/')) {
    throw new Error('The webhook address is not one of Slack\'s. It starts with https://hooks.slack.com/services/. Save it again under Plugins.');
  }
  return url;
}

/**
 * Slack: posts to a channel when a visitor sends a form and when a new contact is made. An owner
 * saves the channel's incoming webhook address, which is kept as a secret since it is a key. A
 * message says what happened and where; it names the person only if the owner asks for that.
 * One that cannot be posted is tried again for about a day. Built on the plugin surface alone.
 */
export const slack = definePlugin({
  name: 'slack',
  apiVersion: 1,
  label: { en: 'Slack' },
  description: { en: 'Post to a Slack channel when a visitor sends a form or a new contact is made, so your team hears of it at once. Experimental: tested, but not yet tried against the real service.' },
  version: '1.0.0',
  permissions: ['submission:read', 'contact:read'],
  enabledByDefault: false,
  settings: [
    { key: 'submissions', type: 'boolean', label: { en: 'Post when a form is sent' } },
    { key: 'contacts', type: 'boolean', label: { en: 'Post when a new contact is made' }, help: { en: 'Tick neither to post both.' } },
    {
      key: 'includePerson',
      type: 'boolean',
      label: { en: 'Name the person in the message' },
      help: { en: 'Left off, a message says which form was sent and from which page, and your team opens the CMS to see who. Turned on, the name and email are posted to the channel, where everyone in it can read them.' },
    },
  ],
  secrets: [{ key: 'webhookUrl', label: { en: 'Incoming webhook address' }, help: { en: 'In Slack: add the Incoming Webhooks app to a channel and copy its address. It starts with https://hooks.slack.com/services/.' } }],
  setup(cms) {
    cms.tasks.define(POST, async (payload) => {
      if (!isRecord(payload) || typeof payload['text'] !== 'string') throw new Error('This message was kept in a form this version cannot read.');
      const saved = await cms.secrets.get('webhookUrl');
      if (saved === undefined) throw new Error('No webhook address is saved. Save one under Plugins, then try again.');
      const url = slackAddress(saved);
      let answer: Response;
      try {
        answer = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Velocity-CMS-Slack/1' }, body: JSON.stringify({ text: payload['text'] }), redirect: 'manual', signal: AbortSignal.timeout(ANSWER_WITHIN_MS) });
      } catch {
        throw new Error(`Slack could not be reached within ${ANSWER_WITHIN_MS / 1000} seconds.`);
      }
      if (answer.status === 403 || answer.status === 404 || answer.status === 410) throw new Error('Slack no longer takes this webhook address. Make a new one in Slack and save it under Plugins.');
      if (!answer.ok) throw new Error(`Slack answered ${answer.status}.`);
    });

    const wants = async (what: 'submissions' | 'contacts') => {
      const settings = await cms.settings.get();
      return { asked: settings[what] === true || (settings['submissions'] !== true && settings['contacts'] !== true), person: settings['includePerson'] === true };
    };

    // What looks like spam is kept in the inbox and told to nobody else.
    cms.events.on('submission.received', async ({ submission, form }) => {
      if (submission.status === 'spam') return;
      const { asked, person } = await wants('submissions');
      if (!asked) return;
      const name = plain(form.label['en'] ?? Object.values(form.label)[0] ?? form.key);
      const from = submission.page === undefined ? '' : ` from ${plain(submission.page)}`;
      const who = person && submission.email !== undefined ? ` by ${plain(submission.email)}` : '';
      await cms.tasks.add(POST, { text: `:incoming_envelope: *${name}* was sent${from}${who}.` }, { label: `A form sent, to Slack` });
    });
    cms.events.on('contact.saved', async ({ contact, imported }) => {
      // Only the first save is news: later ones are the team's own changes, and a file of contacts is not news line by line.
      if (contact.revision !== 1 || imported === true) return;
      const { asked, person } = await wants('contacts');
      if (!asked) return;
      const who = person ? `: ${plain(contact.name ?? contact.email)}${contact.name !== undefined ? ` (${plain(contact.email)})` : ''}` : '';
      await cms.tasks.add(POST, { text: `:bust_in_silhouette: A new contact was added${who}.` }, { label: 'A new contact, to Slack' });
    });
  },
});
