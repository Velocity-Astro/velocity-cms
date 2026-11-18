import { createCms, type Actor, type Cms } from '@velocity/cms-core';
import { FakeClock, InMemoryEntryRepository, InMemoryPluginStore, InMemorySchemaRepository, SequentialIds } from '@velocity/cms-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogue } from '../index.js';
import { mailchimpHost } from './plugin.js';

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const editor: Actor = { kind: 'user', id: 'daniel', role: 'editor' };
const KEY = '0123456789abcdef0123456789abcdef-us21';

interface Sent {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: { members: { email_address: string; status: string; merge_fields: Record<string, string>; tags?: string[] }[]; update_existing: boolean };
}

let cms: Cms;
let store: InMemoryPluginStore;
let sent: Sent[];
/** What Mailchimp answers with, by turn: a status, or the errors of a 200. Past the end it takes everyone. */
let answers: (number | { error_code: string; error: string }[])[];

beforeEach(async () => {
  sent = [];
  answers = [];
  vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string>; body: string; redirect: string }) => {
    expect(init.redirect).toBe('manual');
    sent.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) as Sent['body'] });
    const answer = answers.shift() ?? [];
    return typeof answer === 'number' ? new Response('{}', { status: answer }) : Response.json({ errors: answer });
  });
  store = new InMemoryPluginStore();
  cms = createCms({ pluginStore: store, secret: 'a-test-secret-that-is-long-enough-0123456789', entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
  await cms.forms.create(editor, {
    key: 'contact',
    label: { en: 'Contact us' },
    fields: [
      { key: 'name', type: 'text', label: { en: 'Your name' } },
      { key: 'email', type: 'email', label: { en: 'Email' }, required: true },
      { key: 'phone', type: 'phone', label: { en: 'Phone' } },
      { key: 'newsletter', type: 'boolean', label: { en: 'Send me the newsletter' } },
    ],
    contact: { name: 'name', email: 'email', phone: 'phone' },
  });
  await cms.forms.create(editor, { key: 'tour', label: { en: 'Book a tour' }, fields: [{ key: 'email', type: 'email', label: { en: 'Email' }, required: true }], contact: { email: 'email' } });
  await cms.plugins.load(catalogue);
  await cms.plugins.setEnabled(owner, 'mailchimp', true);
});

afterEach(() => vi.unstubAllGlobals());

/** Saves the plugin's settings, written by key as an owner would fill them in. */
async function settings(values: Record<string, unknown>) {
  const { fields } = await cms.plugins.settings(owner, 'mailchimp');
  await cms.plugins.saveSettings(owner, 'mailchimp', Object.fromEntries(Object.entries(values).map(([key, value]) => [fields.find((field) => field.key === key)?.id ?? key, value])));
}
const tasks = async () => (await cms.plugins.tasks(owner, 'mailchimp')).map((task) => [task.status, task.lastError]);

describe('the Mailchimp plugin', () => {
  it('ships switched off, asking only to read submissions', async () => {
    const fresh = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository() });
    await fresh.plugins.load(catalogue);
    expect((await fresh.plugins.list(owner)).find((plugin) => plugin.name === 'mailchimp')).toMatchObject({ status: 'off', permissions: ['submission:read'], hasSettings: true });
  });

  it('adds whoever sends a form to the audience, to be confirmed by email, and never updates someone already there', async () => {
    await cms.plugins.setSecret(owner, 'mailchimp', 'apiKey', KEY);
    await settings({ audience: 'a1b2c3d4e5' });
    await cms.submissions.submit('contact', { name: 'Ana María Ruiz', email: 'Ana@Example.com', phone: '512 555 0142' });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://us21.api.mailchimp.com/3.0/lists/a1b2c3d4e5');
    expect(sent[0]?.headers['authorization']).toBe(`Basic ${btoa(`velocity:${KEY}`)}`);
    expect(sent[0]?.body).toEqual({ members: [{ email_address: 'ana@example.com', status: 'pending', merge_fields: { FNAME: 'Ana', LNAME: 'María Ruiz', PHONE: '512 555 0142' } }], update_existing: false });
    expect(await tasks()).toEqual([['done', undefined]]);
    // Once Mailchimp has them, nothing of the person stays with the plugin, and the key is never stored in the clear.
    const kept = JSON.stringify([...(await store.list('mailchimp', 'task:')), ...(await store.list('mailchimp', 'secret:'))]);
    expect(kept).not.toContain('ana@example.com');
    expect(kept).not.toContain(KEY);
  });

  it('adds people at once and with tags when told to, and counts someone already there as done', async () => {
    await cms.plugins.setSecret(owner, 'mailchimp', 'apiKey', KEY);
    await settings({ audience: 'a1b2c3d4e5', skipConfirmation: true, tags: 'Website, Leads' });
    answers = [[{ error_code: 'ERROR_CONTACT_EXISTS', error: 'tom@example.com is already a list member' }]];
    await cms.submissions.submit('tour', { email: 'tom@example.com' });
    expect(sent[0]?.body.members[0]).toEqual({ email_address: 'tom@example.com', status: 'subscribed', merge_fields: {}, tags: ['Website', 'Leads'] });
    expect(await tasks()).toEqual([['done', undefined]]);
  });

  it('adds only senders of the forms it is given, only those who ticked the consent field, and never spam', async () => {
    await cms.plugins.setSecret(owner, 'mailchimp', 'apiKey', KEY);
    await settings({ audience: 'a1b2c3d4e5', forms: 'contact, newsletter', consentField: 'newsletter' });
    await cms.submissions.submit('tour', { email: 'tour@example.com' });
    await cms.submissions.submit('contact', { email: 'no@example.com' });
    await cms.submissions.submit('contact', { email: 'bot@example.com', newsletter: true }, { suspected: true });
    await cms.submissions.submit('contact', { email: 'yes@example.com', newsletter: true });
    expect(sent.map((message) => message.body.members[0]?.email_address)).toEqual(['yes@example.com']);
  });

  it('says what is wrong without saying who: no key, a bad audience, a refused key, a refused address', async () => {
    await cms.submissions.submit('tour', { email: 'one@example.com' });
    expect(await tasks()).toEqual([['waiting', 'No API key is saved. Save one under Plugins, then try again.']]);
    await cms.plugins.setSecret(owner, 'mailchimp', 'apiKey', KEY);
    await cms.submissions.submit('tour', { email: 'two@example.com' });
    await settings({ audience: 'a1b2c3d4e5' });
    answers = [401, 404, [{ error_code: 'ERROR_GENERIC', error: 'three@example.com looks fake or invalid' }]];
    for (const email of ['three@example.com', 'four@example.com', 'five@example.com']) await cms.submissions.submit('tour', { email });
    const said = (await tasks()).map(([, error]) => error);
    expect(said).toEqual(
      expect.arrayContaining([
        'The audience ID is missing or is not one. Find it in Mailchimp under Audience, Settings.',
        'Mailchimp refused the API key. Save a working one under Plugins.',
        'Mailchimp has no audience with this ID. Check the audience ID in the settings.',
        'Mailchimp did not take this address (ERROR_GENERIC).',
      ]),
    );
    expect(JSON.stringify(await cms.plugins.tasks(owner, 'mailchimp'))).not.toContain('@example.com');
    expect(sent.every((message) => new URL(message.url).host === 'us21.api.mailchimp.com')).toBe(true);
  });

  it('finds the host in the key and nowhere else', () => {
    expect(mailchimpHost(' abc-us6 ')).toBe('us6.api.mailchimp.com');
    for (const key of ['abc', 'abc-evil.example.com', 'abc-us21/../x', 'abc-US21', '']) expect(() => mailchimpHost(key)).toThrowError(/does not look like a Mailchimp key/);
  });
});
