import { createCms, type Actor, type Cms } from '@velocity/cms-core';
import { FakeClock, InMemoryEntryRepository, InMemoryPluginStore, InMemorySchemaRepository, SequentialIds } from '@velocity/cms-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogue } from '../index.js';
import { HUBSPOT_UPSERT } from './plugin.js';

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const editor: Actor = { kind: 'user', id: 'daniel', role: 'editor' };
const TOKEN = 'pat-na1-00000000-SECRET';

interface Sent {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly input: { id: string; idProperty: string; properties: Record<string, string> };
}

let cms: Cms;
let store: InMemoryPluginStore;
let sent: Sent[];
let answers: number[];

beforeEach(async () => {
  sent = [];
  answers = [];
  vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string>; body: string; redirect: string }) => {
    expect(init.redirect).toBe('manual');
    const [input] = (JSON.parse(init.body) as { inputs: Sent['input'][] }).inputs;
    if (input) sent.push({ url: String(url), headers: init.headers, input });
    return new Response('{}', { status: answers.shift() ?? 200 });
  });
  store = new InMemoryPluginStore();
  cms = createCms({ pluginStore: store, secret: 'a-test-secret-that-is-long-enough-0123456789', entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
  await cms.plugins.load(catalogue);
  await cms.plugins.setEnabled(owner, 'hubspot', true);
});

afterEach(() => vi.unstubAllGlobals());

async function settings(values: Record<string, unknown>) {
  const { fields } = await cms.plugins.settings(owner, 'hubspot');
  await cms.plugins.saveSettings(owner, 'hubspot', Object.fromEntries(Object.entries(values).map(([key, value]) => [fields.find((field) => field.key === key)?.id ?? key, value])));
}

describe('the HubSpot plugin', () => {
  it('ships switched off, asking only to read contacts', async () => {
    const fresh = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository() });
    await fresh.plugins.load(catalogue);
    expect((await fresh.plugins.list(owner)).find((plugin) => plugin.name === 'hubspot')).toMatchObject({ status: 'off', permissions: ['contact:read'] });
  });

  it('makes a new contact in HubSpot, matched by email, and sends a change after it', async () => {
    await cms.plugins.setSecret(owner, 'hubspot', 'accessToken', TOKEN);
    await settings({ lifecycleStage: ' Lead ' });
    const ana = await cms.contacts.create(editor, { email: 'ana@example.com', name: 'Ana María Ruiz', phone: '512 555 0142' });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(HUBSPOT_UPSERT);
    expect(sent[0]?.headers['authorization']).toBe(`Bearer ${TOKEN}`);
    expect(sent[0]?.input).toEqual({ id: 'ana@example.com', idProperty: 'email', properties: { email: 'ana@example.com', firstname: 'Ana', lastname: 'María Ruiz', phone: '512 555 0142', lifecyclestage: 'lead' } });

    await cms.contacts.update(editor, ana.id, { name: 'Ana Ruiz', expectedRevision: 1 });
    // A change never moves someone back to a stage: only a new contact is given one.
    expect(sent[1]?.input.properties).toEqual({ email: 'ana@example.com', firstname: 'Ana', lastname: 'Ruiz', phone: '512 555 0142' });
    expect((await cms.plugins.tasks(owner, 'hubspot')).map((task) => task.status)).toEqual(['done', 'done']);
    // Once HubSpot has them, nothing of the person stays with the plugin, and the token is never stored in the clear.
    const kept = JSON.stringify(await store.list('hubspot', ''));
    expect(kept).not.toContain('ana@example.com');
    expect(kept).not.toContain(TOKEN);
  });

  it('sends only new contacts when told to, and leaves out a stage HubSpot does not have', async () => {
    await cms.plugins.setSecret(owner, 'hubspot', 'accessToken', TOKEN);
    await settings({ onlyNew: true, lifecycleStage: 'vip' });
    const tom = await cms.contacts.create(editor, { email: 'tom@example.com' });
    await cms.contacts.update(editor, tom.id, { phone: '512 555 0199', expectedRevision: 1 });
    expect(sent.map((message) => message.input.properties)).toEqual([{ email: 'tom@example.com' }]);
  });

  it('says what is wrong without saying who', async () => {
    await cms.contacts.create(editor, { email: 'one@example.com' });
    await cms.plugins.setSecret(owner, 'hubspot', 'accessToken', TOKEN);
    answers = [401, 403, 207, 500];
    for (const email of ['two@example.com', 'three@example.com', 'four@example.com', 'five@example.com']) await cms.contacts.create(editor, { email });
    const tasks = await cms.plugins.tasks(owner, 'hubspot');
    expect(tasks.map((task) => task.lastError).sort()).toEqual([
      'HubSpot answered 207 and did not take this contact.',
      'HubSpot answered 500 and did not take this contact.',
      'HubSpot refused the access token. Save a working one under Plugins.',
      'No access token is saved. Save one under Plugins, then try again.',
      'The access token may not write contacts. Give the private app crm.objects.contacts.write in HubSpot.',
    ]);
    expect(JSON.stringify(tasks)).not.toContain('@example.com');
  });
});
