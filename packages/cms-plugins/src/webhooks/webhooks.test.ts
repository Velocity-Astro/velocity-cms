import { createCms, type Actor, type Cms } from '@velocity/cms-core';
import { FakeClock, InMemoryEntryRepository, InMemoryPluginStore, InMemorySchemaRepository, SequentialIds } from '@velocity/cms-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogue } from '../index.js';
import { deliveryAddress } from './plugin.js';

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const editor: Actor = { kind: 'user', id: 'daniel', role: 'editor' };

interface Sent {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: { id: string; event: string; createdAt: string; data: Record<string, unknown> };
  readonly raw: string;
}

let cms: Cms;
let store: InMemoryPluginStore;
let sent: Sent[];
/** What the other side answers with, by turn. Past the end it answers 200. */
let answers: (number | 'down')[];

beforeEach(async () => {
  sent = [];
  answers = [];
  vi.stubGlobal('fetch', async (url: URL, init: { headers: Record<string, string>; body: string; redirect: string }) => {
    expect(init.redirect).toBe('manual');
    const answer = answers.shift() ?? 200;
    if (answer === 'down') throw new Error('connect ECONNREFUSED https://hooks.example.com/in?key=hidden');
    sent.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) as Sent['body'], raw: init.body });
    return new Response(null, { status: answer });
  });
  store = new InMemoryPluginStore();
  cms = createCms({ pluginStore: store, secret: 'a-test-secret-that-is-long-enough-0123456789', entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
  await cms.forms.create(editor, {
    key: 'contact',
    label: { en: 'Contact us' },
    fields: [
      { key: 'name', type: 'text', label: { en: 'Your name' } },
      { key: 'email', type: 'email', label: { en: 'Email' }, required: true },
    ],
    contact: { name: 'name', email: 'email' },
  });
  await cms.plugins.load(catalogue);
  await cms.plugins.setEnabled(owner, 'webhooks', true);
});

afterEach(() => vi.unstubAllGlobals());

/** Saves the plugin's addresses, written by key as an owner would fill them in. */
async function endpoints(list: readonly Record<string, unknown>[]) {
  const { fields } = await cms.plugins.settings(owner, 'webhooks');
  const field = fields.find((candidate) => candidate.key === 'endpoints');
  const inner = ((field?.options['of'] as { options: { fields: { id: string; key: string }[] } } | undefined)?.options.fields ?? []);
  const byId = (item: Record<string, unknown>) => Object.fromEntries(Object.entries(item).map(([key, value]) => [inner.find((candidate) => candidate.key === key)?.id ?? key, value]));
  await cms.plugins.saveSettings(owner, 'webhooks', { [field?.id ?? '']: list.map(byId) });
}

describe('the Webhooks plugin', () => {
  it('ships switched off, asking only to read', async () => {
    const fresh = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository() });
    await fresh.plugins.load(catalogue);
    expect((await fresh.plugins.list(owner)).find((plugin) => plugin.name === 'webhooks')).toMatchObject({ status: 'off', permissions: ['entry:read', 'submission:read', 'contact:read'], hasSettings: true });
  });

  it('tells each address of a submission and the contact it made, by field key', async () => {
    await endpoints([{ url: 'https://hooks.example.com/in' }]);
    await cms.submissions.submit('contact', { name: 'Ana Ruiz', email: 'ana@example.com' }, { page: '/contact/' });
    expect(sent.map((message) => message.body.event).sort()).toEqual(['contact.saved', 'submission.received']);
    const submission = sent.find((message) => message.body.event === 'submission.received');
    expect(submission?.url).toBe('https://hooks.example.com/in');
    expect(submission?.body.data).toMatchObject({ form: { key: 'contact' }, submission: { email: 'ana@example.com', page: '/contact/', fields: { name: 'Ana Ruiz', email: 'ana@example.com' } } });
    expect(submission?.headers).toMatchObject({ 'content-type': 'application/json', 'x-velocity-event': 'submission.received', 'x-velocity-delivery': submission?.body.id });
    expect(submission?.headers['x-velocity-signature']).toBeUndefined();
    expect(await cms.plugins.tasks(owner, 'webhooks')).toMatchObject([{ status: 'done' }, { status: 'done' }]);
    // Once delivered, nothing of what was sent stays with the plugin.
    expect(JSON.stringify(await store.list('webhooks', 'task:'))).not.toContain('ana@example.com');
  });

  it('sends an address only what it ticked, and tells nobody of spam', async () => {
    await endpoints([
      { url: 'https://forms.example.com/in', submissions: true },
      { url: 'https://crm.example.com/in', contacts: true, deals: true },
    ]);
    await cms.submissions.submit('contact', { name: 'Ana', email: 'ana@example.com' });
    await cms.submissions.submit('contact', { name: 'Bot', email: 'bot@example.com' }, { suspected: true });
    expect(sent.map((message) => [new URL(message.url).host, message.body.event])).toEqual([
      ['crm.example.com', 'contact.saved'],
      ['forms.example.com', 'submission.received'],
    ]);
  });

  it('signs each message when a signing secret is saved', async () => {
    await endpoints([{ url: 'https://hooks.example.com/in', contacts: true }]);
    await cms.plugins.setSecret(owner, 'webhooks', 'signingSecret', 'shh-it-is-a-secret');
    await cms.contacts.create(editor, { email: 'tom@example.com', name: 'Tom' });
    const [message] = sent;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('shh-it-is-a-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message?.raw ?? '')))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    expect(message?.headers['x-velocity-signature']).toBe(`sha256=${expected}`);
  });

  it('keeps a message that could not be delivered, tries again, and never says more than the host', async () => {
    await endpoints([{ url: 'https://hooks.example.com/in?key=hidden', contacts: true }]);
    answers = ['down', 500];
    await cms.contacts.create(editor, { email: 'tom@example.com', name: 'Tom' });
    expect(sent).toEqual([]);
    expect(await cms.plugins.tasks(owner, 'webhooks')).toMatchObject([{ status: 'waiting', attempts: 1, label: 'contact.saved to hooks.example.com', lastError: 'hooks.example.com could not be reached within 5 seconds.' }]);
    for (let looks = 0; looks < 400 && sent.length < 2; looks += 1) await cms.plugins.work({ now: true });
    expect(sent.map((message) => message.body.event)).toEqual(['contact.saved', 'contact.saved']);
    // Each try is the same delivery, so the other side can tell a repeat.
    expect(sent[0]?.body.id).toBe(sent[1]?.body.id);
    expect(await cms.plugins.tasks(owner, 'webhooks')).toMatchObject([{ status: 'done', attempts: 3 }]);
  });

  it('tells of a page published, by the key of its type', async () => {
    await endpoints([{ url: 'https://hooks.example.com/in', published: true }]);
    const pages = await cms.schema.create(owner, { key: 'pages', kind: 'collection', label: { en: 'Pages' }, fields: [{ key: 'title', type: 'text', label: { en: 'Title' } }] });
    const entry = await cms.content.create(owner, { typeId: pages.id, locale: 'en', slug: 'about', data: {} });
    await cms.content.publish(owner, entry.id, entry.revision);
    expect(sent.map((message) => [message.body.event, message.body.data])).toEqual([['entry.published', { entry: { id: entry.id, type: 'pages', locale: 'en', slug: 'about', updatedAt: expect.any(String) as string } }]]);
  });

  it('sends nothing to a public name that leads to a private machine', async () => {
    const leadsTo: Record<string, string[]> = { 'hooks.example.com': ['93.184.216.34'], 'inside.example.com': ['93.184.216.34', '10.0.0.8'] };
    cms = createCms({ pluginStore: store, lookup: async (host) => leadsTo[host] ?? Promise.reject(new Error('ENOTFOUND')), entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
    await cms.plugins.load(catalogue);
    await cms.plugins.setEnabled(owner, 'webhooks', true);
    await endpoints([{ url: 'https://hooks.example.com/in' }, { url: 'https://inside.example.com/in' }, { url: 'https://nowhere.example.com/in' }]);
    await cms.contacts.create(editor, { email: 'tom@example.com' });
    expect(sent.map((message) => message.url)).toEqual(['https://hooks.example.com/in']);
    const failed = (await cms.plugins.tasks(owner, 'webhooks')).flatMap((task) => (task.lastError === undefined ? [] : [task.lastError])).sort();
    expect(failed).toEqual(['inside.example.com does not lead to a public address, so nothing is sent to it.', 'nowhere.example.com does not lead to a public address, so nothing is sent to it.']);
  });

  it('sends nothing to an address that is not public and safe, and says so under Plugins', async () => {
    await endpoints([{ url: 'http://hooks.example.com/in' }, { url: 'https://localhost/in' }, { url: 'https://10.0.0.8/in' }]);
    await cms.contacts.create(editor, { email: 'tom@example.com' });
    expect(sent).toEqual([]);
    expect((await cms.plugins.list(owner)).find((plugin) => plugin.name === 'webhooks')).toMatchObject({ faults: 1, lastFault: { where: 'contact.saved' } });
    expect(() => deliveryAddress('https://user:pw@example.com/in')).toThrow(/name or a password/);
    expect(() => deliveryAddress('https://intranet/in')).toThrow(/public address/);
    expect(deliveryAddress('https://hooks.example.com/in').host).toBe('hooks.example.com');
  });
});
