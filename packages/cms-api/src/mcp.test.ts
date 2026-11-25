import { createCms, toStoredData, tokenPermissions, type Actor, type Cms } from '@velocity-astro/cms-core';
import { FakeClock, InMemoryEntryRepository, InMemorySchemaRepository, SequentialIds } from '@velocity-astro/cms-core/in-memory';
import { beforeEach, describe, expect, it } from 'vitest';
import { CmsApi } from './api.js';
import { FixedAuthenticator } from './testing/index.js';

const SITE = 'https://site.test';
const owner: Actor = { kind: 'cli', id: 'seed', role: 'owner' };
const agent = (allowed: { publish: boolean; personalData: boolean }) => ({
  user: { id: 't1', email: '', name: 'Claude' },
  actor: { kind: 'agent' as const, id: 't1', role: 'editor' as const, permissions: tokenPermissions('editor', allowed) },
});

let cms: Cms;
let api: CmsApi;
let authenticator: FixedAuthenticator;
let next = 1;

const rpc = async (method: string, params?: unknown) => {
  const response = await api.handle(
    new Request(`${SITE}/api/cms/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: next++, method, ...(params !== undefined && { params }) }) }),
  );
  return (await response.json()) as { result?: Record<string, unknown>; error?: { code: number; message: string } };
};
/** Calls a tool and reads its answer, which is JSON in text, or the refusal's words. */
const tool = async (name: string, args: Record<string, unknown> = {}) => {
  const { result } = await rpc('tools/call', { name, arguments: args });
  const text = (result?.['content'] as { text: string }[] | undefined)?.[0]?.text ?? '';
  return result?.['isError'] ? { refused: text } : (JSON.parse(text) as Record<string, unknown> & { sections?: { id: string; block: string; data: Record<string, unknown> }[] });
};

beforeEach(async () => {
  cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds(), previews: { secret: 'p'.repeat(32) } });
  await cms.schema.define(owner, {
    key: 'pages',
    kind: 'collection',
    label: { en: 'Pages' },
    urlPattern: '/[...slug]',
    titleField: 'title',
    fields: [
      { key: 'title', type: 'text', label: { en: 'Title' }, required: true },
      {
        key: 'body',
        type: 'blocks',
        label: { en: 'Sections' },
        options: {
          blocks: [
            { key: 'hero', label: { en: 'Hero' }, fields: [{ key: 'title', type: 'text', label: { en: 'Title' }, required: true }, { key: 'tone', type: 'select', label: { en: 'Look' }, options: { choices: ['light', 'dark'] } }] },
            { key: 'text', label: { en: 'Text' }, fields: [{ key: 'body', type: 'richtext', label: { en: 'Text' } }] },
          ],
        },
      },
    ],
  });
  authenticator = new FixedAuthenticator(agent({ publish: false, personalData: false }));
  api = new CmsApi({ cms, authenticator });
});

describe('the MCP endpoint', () => {
  it('introduces itself in the version the client asks for, and lists its tools with their inputs', async () => {
    const { result } = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect(result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'velocity-cms' }, capabilities: { tools: {} } });
    const listed = (await rpc('tools/list')).result?.['tools'] as { name: string; inputSchema: { type: string } }[];
    expect(listed.map((one) => one.name)).toEqual(expect.arrayContaining(['describe_site', 'create_entry', 'add_section', 'set_sections']));
    expect(listed.find((one) => one.name === 'create_entry')?.inputSchema.type).toBe('object');
  });

  it('answers a notification with nothing', async () => {
    const response = await api.handle(new Request(`${SITE}/api/cms/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }));
    expect(response.status).toBe(202);
  });

  it('refuses anyone not signed in or holding a token', async () => {
    authenticator.session = null;
    const response = await api.handle(new Request(`${SITE}/api/cms/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
    expect(response.status).toBe(401);
  });

  it('describes the site and what the token may do', async () => {
    const site = await tool('describe_site');
    expect(site['mayDo']).toEqual(expect.arrayContaining(['entry:write']));
    expect(site['mayDo']).not.toContain('entry:publish');
    expect(site['contentTypes']).toEqual([expect.objectContaining({ key: 'pages', builtFromSections: true })]);
    const type = await tool('get_content_type', { type: 'pages' });
    expect(JSON.stringify(type)).not.toContain('"id"');
    expect((await tool('list_blocks', { type: 'pages' }))['blocks']).toEqual([expect.objectContaining({ key: 'hero' }), expect.objectContaining({ key: 'text' })]);
  });

  it('builds a page from the template\'s blocks, by key, and keeps it a draft', async () => {
    const page = await tool('create_entry', { type: 'pages', slug: 'about', data: { title: 'About', body: [{ block: 'hero', data: { title: 'Hello', tone: 'dark' } }] } });
    expect(page).toMatchObject({ status: 'draft', title: 'About', data: { title: 'About', body: [{ block: 'hero', data: { title: 'Hello', tone: 'dark' } }] } });
    const id = page['id'] as string;

    const added = await tool('add_section', { id, block: 'text', data: { body: { markdown: '## Who we are\n\nA **small** team.' } } });
    expect(added.sections?.map((section) => section.block)).toEqual(['hero', 'text']);
    // Formatted text is read as it is written, and kept as formatted text.
    expect(added.sections?.[1]?.data['body']).toEqual({ markdown: '## Who we are\n\nA **small** team.' });
    const kept = (await cms.content.get(owner, id)).data;
    expect(JSON.stringify(kept)).toContain('"type":"heading"');
    expect(JSON.stringify(await tool('get_entry', { id }))).not.toContain('"type":"doc"');

    const [hero, text] = added.sections ?? [];
    const moved = await tool('move_section', { id, section: text?.id, to: 0 });
    expect(moved.sections?.map((section) => section.block)).toEqual(['text', 'hero']);
    expect(moved.sections?.[1]?.id).toBe(hero?.id);

    const changed = await tool('update_section', { id, section: hero?.id, data: { title: 'Welcome' } });
    expect(changed.sections?.[1]?.data).toEqual({ title: 'Welcome', tone: 'dark' });

    const removed = await tool('remove_section', { id, section: text?.id });
    expect(removed.sections?.map((section) => section.block)).toEqual(['hero']);
    expect((await cms.content.get(owner, id)).status).toBe('draft');
  });

  it('hands an idea no block can show what it needs to become a new kind of section', async () => {
    await cms.schema.define(owner, { key: 'theme', kind: 'single', label: { en: 'Theme' }, fields: [{ key: 'brand', type: 'color', label: { en: 'Brand' } }, { key: 'headings', type: 'font', label: { en: 'Headings' }, options: { choices: ['serif', 'sans'] } }] });
    const type = await cms.schema.getByKey('theme');
    const made = await cms.content.create(owner, { typeId: type.id, locale: 'en', slug: 'theme', data: toStoredData(type.fields, { brand: '#ff6600', headings: 'serif' }, () => 'new') });
    await cms.content.publish(owner, made.id);
    const design = (await tool('design_new_section')) as { theme: { type: string; fields: { key: string; value: unknown }[] }[]; blocks: { type: string; blocks: { key: string }[] }[]; steps: string[] };
    expect(design.theme).toEqual([{ type: 'theme', fields: [expect.objectContaining({ key: 'brand', value: '#ff6600' }), expect.objectContaining({ key: 'headings', value: 'serif', options: { choices: ['serif', 'sans'] } })] }]);
    expect(design.blocks).toEqual([{ type: 'pages', field: 'body', blocks: [expect.objectContaining({ key: 'hero' }), expect.objectContaining({ key: 'text' })] }]);
    expect(design.steps.join(' ')).toContain('cms-add-section');
  });

  it('stays on the rails: no block, field or look the template does not have', async () => {
    const page = await tool('create_entry', { type: 'pages', slug: 'rails', data: { title: 'Rails' } });
    const id = page['id'] as string;
    expect(await tool('add_section', { id, block: 'carousel' })).toEqual({ refused: expect.stringContaining('The blocks this page can be built from are: hero, text. To add a new kind of section, see design_new_section.') });
    expect(await tool('add_section', { id, block: 'hero', data: { title: 'Hi', colour: '#ff0000' } })).toEqual({ refused: expect.stringContaining('There is no field "colour"') });
    expect(await tool('add_section', { id, block: 'hero', data: { title: 'Hi', tone: 'neon' } })).toEqual({ refused: expect.stringContaining('tone') });
  });

  it('publishes only for a token allowed to', async () => {
    const page = await tool('create_entry', { type: 'pages', slug: 'news', data: { title: 'News' } });
    expect(await tool('publish_entry', { id: page['id'] })).toEqual({ refused: expect.stringContaining('entry:publish') });
    authenticator.session = agent({ publish: true, personalData: false });
    expect(await tool('publish_entry', { id: page['id'] })).toMatchObject({ status: 'published', page: '/news/' });
  });

  it('keeps personal data from a token not allowed it, and out of its list of tools', async () => {
    const names = ((await rpc('tools/list')).result?.['tools'] as { name: string }[]).map((one) => one.name);
    expect(names).not.toContain('list_contacts');
    expect(await tool('list_contacts')).toEqual({ refused: expect.stringContaining('contact:read') });
    authenticator.session = agent({ publish: false, personalData: true });
    expect(((await rpc('tools/list')).result?.['tools'] as { name: string }[]).map((one) => one.name)).toContain('list_contacts');
  });

  it('shows whoever has an entry open that an agent is at work on it, by the token\'s name', async () => {
    const page = await tool('create_entry', { type: 'pages', slug: 'about', data: { title: 'About' } });
    const person: Actor = { kind: 'user', id: 'u1', role: 'editor' };
    const id = String(page['id']);
    // Making an entry is about no entry yet; reading or changing one is.
    expect((await cms.presence.here(person, id, 'Dana')).others).toEqual([]);
    await tool('get_entry', { id });
    expect((await cms.presence.here(person, id, 'Dana')).others).toEqual([{ id: 't1', kind: 'agent', name: 'Claude' }]);
    // A tool that was refused did no work there, and one about no entry marks nothing.
    expect(await tool('get_entry', { id: 'missing' })).toHaveProperty('refused');
    expect((await cms.presence.here(person, id, 'Dana')).others).toHaveLength(1);
  });

  it('updates by key and leaves the rest alone', async () => {
    const page = await tool('create_entry', { type: 'pages', slug: 'team', data: { title: 'Team', body: [{ block: 'hero', data: { title: 'Us' } }] } });
    const updated = await tool('update_entry', { id: page['id'], data: { title: 'Our team' } });
    expect(updated['data']).toEqual({ title: 'Our team', body: [expect.objectContaining({ block: 'hero', data: { title: 'Us' } })] });
  });
});
