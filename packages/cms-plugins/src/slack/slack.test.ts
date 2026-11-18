import { createCms, type Actor, type Cms } from '@velocity/cms-core';
import { FakeClock, InMemoryEntryRepository, InMemoryPluginStore, InMemorySchemaRepository, SequentialIds } from '@velocity/cms-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogue } from '../index.js';
import { slackAddress } from './plugin.js';

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const editor: Actor = { kind: 'user', id: 'daniel', role: 'editor' };
const HOOK = 'https://hooks.slack.com/services/T000/B000/abcSECRETxyz';

let cms: Cms;
let store: InMemoryPluginStore;
let sent: { url: string; text: string }[];
let answers: number[];

beforeEach(async () => {
  sent = [];
  answers = [];
  vi.stubGlobal('fetch', async (url: URL, init: { body: string; redirect: string }) => {
    expect(init.redirect).toBe('manual');
    sent.push({ url: String(url), text: (JSON.parse(init.body) as { text: string }).text });
    return new Response('ok', { status: answers.shift() ?? 200 });
  });
  store = new InMemoryPluginStore();
  cms = createCms({ pluginStore: store, secret: 'a-test-secret-that-is-long-enough-0123456789', entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
  await cms.forms.create(editor, {
    key: 'contact',
    label: { en: 'Contact <us>' },
    fields: [
      { key: 'name', type: 'text', label: { en: 'Your name' } },
      { key: 'email', type: 'email', label: { en: 'Email' }, required: true },
    ],
    contact: { name: 'name', email: 'email' },
  });
  await cms.plugins.load(catalogue);
  await cms.plugins.setEnabled(owner, 'slack', true);
});

afterEach(() => vi.unstubAllGlobals());

async function settings(values: Record<string, unknown>) {
  const { fields } = await cms.plugins.settings(owner, 'slack');
  await cms.plugins.saveSettings(owner, 'slack', Object.fromEntries(Object.entries(values).map(([key, value]) => [fields.find((field) => field.key === key)?.id ?? key, value])));
}

describe('the Slack plugin', () => {
  it('ships switched off', async () => {
    const fresh = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository() });
    await fresh.plugins.load(catalogue);
    expect((await fresh.plugins.list(owner)).find((plugin) => plugin.name === 'slack')).toMatchObject({ status: 'off', permissions: ['submission:read', 'contact:read'] });
  });

  it('posts that a form was sent and a contact was made, without naming the person', async () => {
    await cms.plugins.setSecret(owner, 'slack', 'webhookUrl', HOOK);
    await cms.submissions.submit('contact', { name: 'Ana Ruiz', email: 'ana@example.com' }, { page: '/contact/' });
    expect(sent.map((message) => message.url)).toEqual([HOOK, HOOK]);
    expect(sent.map((message) => message.text).sort()).toEqual([':bust_in_silhouette: A new contact was added.', ':incoming_envelope: *Contact &lt;us&gt;* was sent from /contact/.']);
    // The address is a key: it is sealed, and no label or error holds it.
    expect(JSON.stringify(await store.list('slack', ''))).not.toContain('abcSECRETxyz');
    expect(JSON.stringify(await cms.plugins.tasks(owner, 'slack'))).not.toContain('abcSECRETxyz');
  });

  it('names the person when asked to, posts only what is ticked, and never spam or a contact that only changed', async () => {
    await cms.plugins.setSecret(owner, 'slack', 'webhookUrl', HOOK);
    await settings({ contacts: true, includePerson: true });
    await cms.submissions.submit('contact', { name: '*Ana* <!channel>', email: 'ana@example.com' });
    await cms.submissions.submit('contact', { name: 'Bot', email: 'bot@example.com' }, { suspected: true });
    expect(sent.map((message) => message.text)).toEqual([':bust_in_silhouette: A new contact was added: Ana &lt;!channel&gt; (ana@example.com).']);
    const [ana] = (await cms.contacts.find(editor)).items;
    await cms.contacts.update(editor, ana?.id ?? '', { phone: '512 555 0142', expectedRevision: 1 });
    expect(sent).toHaveLength(1);
    // Once posted, nothing of the person stays with the plugin.
    expect(JSON.stringify(await store.list('slack', 'task:'))).not.toContain('ana@example.com');
  });

  it('says what is wrong: no address saved, or one Slack no longer takes', async () => {
    await cms.contacts.create(editor, { email: 'tom@example.com' });
    await cms.plugins.setSecret(owner, 'slack', 'webhookUrl', HOOK);
    answers = [404];
    await cms.contacts.create(editor, { email: 'li@example.com' });
    expect((await cms.plugins.tasks(owner, 'slack')).map((task) => task.lastError).sort()).toEqual([
      'No webhook address is saved. Save one under Plugins, then try again.',
      'Slack no longer takes this webhook address. Make a new one in Slack and save it under Plugins.',
    ]);
  });

  it('posts only to Slack\'s own address for incoming webhooks', () => {
    expect(slackAddress(` ${HOOK} `).href).toBe(HOOK);
    for (const address of ['http://hooks.slack.com/services/a', 'https://hooks.slack.com.evil.example/services/a', 'https://example.com/services/a', 'https://hooks.slack.com/other', 'https://user@hooks.slack.com/services/a', 'nothing']) {
      expect(() => slackAddress(address)).toThrowError(/not one of Slack's/);
    }
  });
});
