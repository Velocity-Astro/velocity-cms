import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CmsApi } from '@velocity-astro/cms-api';
import { FixedAuthenticator } from '@velocity-astro/cms-api/testing';
import { createCms, tokenPermissions, type Actor, type Cms } from '@velocity-astro/cms-core';
import { FakeClock, InMemoryEntryRepository, InMemorySchemaRepository, SequentialIds } from '@velocity-astro/cms-core/in-memory';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGENTS_LINE, AGENT_FILES_VERSION, installAgentFiles, shippedSkills } from './agent-files.js';
import { runCli } from './cli.js';
import { readEnvFile } from './init.js';
import { readFrontMatter, readImport, slugFrom } from './import-files.js';

let dir: string;
let printed: string[];
const print = (line: string) => printed.push(line);
const read = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8');
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-cms-agents-'));
  printed = [];
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('the agent files', () => {
  it('are installed with the rules, each skill in both folders, and a line in AGENTS.md', () => {
    installAgentFiles(dir, print);
    expect(read('.agents/cms.md')).toContain(`velocity-cms ${AGENT_FILES_VERSION}`);
    expect(shippedSkills()).toHaveLength(9);
    for (const skill of shippedSkills()) {
      const text = read(`.agents/skills/${skill}/SKILL.md`);
      expect(text).toMatch(new RegExp(`^---\\nname: ${skill}\\ndescription: .+\\n---`));
      expect(read(`.claude/skills/${skill}/SKILL.md`)).toBe(text);
    }
    expect(read('AGENTS.md')).toContain(AGENTS_LINE);
    expect(read('CLAUDE.md')).toBe('@AGENTS.md\n');
  });

  it('change nothing when run again, keep the site\'s own notes and skills, and remove a cms- skill no longer shipped', () => {
    write('AGENTS.md', '# Our site\n\nUse tabs.\n');
    write('.claude/skills/our-deploy/SKILL.md', 'ours');
    write('.claude/skills/cms-retired/SKILL.md', 'old');
    installAgentFiles(dir, print);
    expect(read('AGENTS.md')).toBe(`# Our site\n\nUse tabs.\n\n${AGENTS_LINE}\n`);
    expect(fs.existsSync(path.join(dir, 'CLAUDE.md'))).toBe(false);
    expect(read('.claude/skills/our-deploy/SKILL.md')).toBe('ours');
    expect(fs.existsSync(path.join(dir, '.claude/skills/cms-retired'))).toBe(false);
    printed = [];
    installAgentFiles(dir, print);
    expect(printed).toEqual(['Agent files: already up to date.']);
    expect(read('AGENTS.md')).toBe(`# Our site\n\nUse tabs.\n\n${AGENTS_LINE}\n`);
  });

  it('come with init, and with `velocity-cms agents`', async () => {
    write('astro.config.mjs', "export default { integrations: [] };\n");
    expect(await runCli(['init'], { env: {}, print, dir })).toBe(0);
    expect(fs.existsSync(path.join(dir, '.agents/cms.md'))).toBe(true);
    fs.rmSync(path.join(dir, '.agents'), { recursive: true });
    expect(await runCli(['agents'], { env: {}, print, dir })).toBe(0);
    expect(fs.existsSync(path.join(dir, '.agents/skills/cms-add-section/SKILL.md'))).toBe(true);
  });
});

describe('velocity-cms token', () => {
  it('saves a token to .env without printing it, and the token signs in', async () => {
    const env = { VELOCITY_CMS_DATABASE_URL: `file:${path.join(dir, 'data.db')}` };
    write('data.db', '');
    write('.env', 'VELOCITY_CMS_SECRET=s\n');
    write('.gitignore', '.env\n');
    expect(await runCli(['token', 'Claude on my laptop', '--publish', '--save'], { env, print, dir })).toBe(0);
    const token = readEnvFile(read('.env'))['VELOCITY_CMS_TOKEN'] ?? '';
    expect(token).toMatch(/^vcms_/);
    expect(read('.env')).toContain('VELOCITY_CMS_SECRET=s\n');
    expect(printed.join('\n')).not.toContain(token);
    expect(printed.join('\n')).toContain('"Claude on my laptop" acts as editor, may publish');
    // Saved again, it replaces the one before.
    expect(await runCli(['token', 'Claude again', '--save'], { env, print, dir })).toBe(0);
    expect(read('.env').match(/VELOCITY_CMS_TOKEN=/g)).toHaveLength(1);
    expect(readEnvFile(read('.env'))['VELOCITY_CMS_TOKEN']).not.toBe(token);
  });

  it('refuses a role a token cannot have, a token with no name, and a database that is not there', async () => {
    const env = { VELOCITY_CMS_DATABASE_URL: `file:${path.join(dir, 'missing.db')}` };
    expect(await runCli(['token', 'x', '--role', 'owner'], { env, print, dir })).toBe(1);
    expect(await runCli(['token'], { env, print, dir })).toBe(1);
    expect(await runCli(['token', 'x'], { env, print, dir })).toBe(1);
    expect(printed.join('\n')).toContain('A token acts as editor or author.');
    expect(printed.join('\n')).toContain('has not been made yet');
    expect(fs.existsSync(path.join(dir, 'missing.db'))).toBe(false);
  });
});

describe('the content commands', () => {
  const SITE = 'https://site.test';
  const owner: Actor = { kind: 'cli', id: 'seed', role: 'owner' };
  let cms: Cms;
  let env: Record<string, string>;
  let fetchSite: typeof fetch;

  beforeEach(async () => {
    cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
    await cms.schema.define(owner, {
      key: 'posts',
      kind: 'collection',
      label: { en: 'Posts' },
      urlPattern: '/blog/[slug]',
      titleField: 'title',
      fields: [
        { key: 'title', type: 'text', label: { en: 'Title' }, required: true },
        { key: 'summary', type: 'text', label: { en: 'Summary' } },
        { key: 'body', type: 'richtext', label: { en: 'Body' } },
      ],
    });
    const api = new CmsApi({ cms, authenticator: new FixedAuthenticator({ user: { id: 't1', email: '', name: 'Claude' }, actor: { kind: 'agent', id: 't1', role: 'editor', permissions: tokenPermissions('editor', { publish: true, personalData: false }) } }) });
    fetchSite = ((input: string | URL | Request, init?: RequestInit) => api.handle(new Request(input, init))) as typeof fetch;
    env = { VELOCITY_CMS_ORIGIN: SITE, VELOCITY_CMS_TOKEN: 'vcms_test' };
  });

  const run = (...args: string[]) => runCli(args, { env, print, dir, fetch: fetchSite });

  it('ask for a token and an address before anything else', async () => {
    expect(await runCli(['types'], { env: { VELOCITY_CMS_ORIGIN: SITE }, print, dir })).toBe(1);
    expect(printed.join('\n')).toContain('velocity-cms token');
  });

  it('list types, create entries by key and list them', async () => {
    expect(await run('types')).toBe(0);
    expect(printed.join('\n')).toContain('posts (collection, /blog/[slug]): title (text), summary (text), body (richtext)');
    expect(await run('create', 'posts', 'hello', '--data', '{"title":"Hello","body":{"markdown":"Some **bold** words."}}', '--publish')).toBe(0);
    const [entry] = (await cms.content.find(owner, { typeId: (await cms.schema.list())[0]?.id ?? '' })).items;
    expect(entry?.published).toBeTruthy();
    printed = [];
    expect(await run('entries', 'posts')).toBe(0);
    expect(printed.join('\n')).toMatch(/published\s+en\s+hello\s+Hello/);
  });

  it('import a folder of Markdown as drafts, naming what was left out, and export it again', async () => {
    write('posts/2024-05-01-first-post.md', '---\ntitle: "First post"\nsummary: A start\ntags:\n  - news\n---\n\nThe **first** words.\n');
    write('posts/second/index.md', '---\ntitle: Second\n---\nMore words.\n');
    expect(await run('import', 'posts', 'posts')).toBe(0);
    expect(printed[0]).toBe('Imported 2 new posts as drafts, from 2 found.');
    expect(printed[1]).toContain('Left out, since posts has no field for them: tags.');
    printed = [];
    expect(await run('import', 'posts', 'posts')).toBe(0);
    expect(printed.join('\n')).toContain('first-post is already here (add --update to change it).');
    printed = [];
    expect(await run('export', 'posts', '--out', 'posts.json')).toBe(0);
    const exported = JSON.parse(read('posts.json')) as { slug: string; status: string; data: Record<string, unknown> }[];
    expect(exported.map((entry) => [entry.slug, entry.status])).toEqual(expect.arrayContaining([['first-post', 'draft'], ['second', 'draft']]));
    expect(exported.find((entry) => entry.slug === 'first-post')?.data['summary']).toBe('A start');
  });

  it('say what the site refused, and exit with 1', async () => {
    expect(await run('create', 'posts', 'nameless', '--data', '{"summary":"no title"}', '--publish')).toBe(1);
    expect(printed.join('\n')).toContain('title');
  });

  it('relay an MCP session to the site, line by line', async () => {
    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => (lines.push(chunk), true)) as typeof process.stdout.write;
    try {
      async function* input() {
        yield JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
        yield JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
        yield JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      }
      expect(await runCli(['mcp'], { env, print, dir, fetch: fetchSite, input: input() })).toBe(0);
    } finally {
      process.stdout.write = original;
    }
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '{}').result.protocolVersion).toBe('2025-06-18');
    expect(JSON.parse(lines[1] ?? '{}').result.tools.length).toBeGreaterThan(10);
  });
});

describe('reading files to import', () => {
  it('reads the plain YAML blogs use', () => {
    const { data, body } = readFrontMatter('---\ntitle: "Say \\"hi\\""\ndraft: false\norder: 3\ntags: [a, b]\nlist:\n  - one\n  - two\nabout: |\n  Line one\n  Line two\n---\nBody\n');
    expect(data).toEqual({ title: 'Say "hi"', draft: false, order: 3, tags: ['a', 'b'], list: ['one', 'two'], about: 'Line one\nLine two' });
    expect(body).toBe('Body\n');
    expect(readFrontMatter('No front matter')).toEqual({ data: {}, body: 'No front matter' });
  });

  it('keeps old addresses: a slug in front matter, else the file\'s name without its date, else its folder\'s', () => {
    write('a/2024-01-02-hello-world.md', '---\ntitle: x\n---\n');
    write('a/kept.md', '---\nslug: old-address\n---\n');
    write('a/folder/index.md', '---\ntitle: y\n---\n');
    expect(readImport(path.join(dir, 'a')).map((item) => item.slug)).toEqual(['hello-world', 'folder', 'old-address']);
    write('list.json', JSON.stringify([{ slug: 'one', data: { title: 'One' } }, { slug: 'two', locale: 'fr', title: 'Deux' }]));
    expect(readImport(path.join(dir, 'list.json')).map(({ slug, locale, values }) => ({ slug, locale, values }))).toEqual([
      { slug: 'one', locale: undefined, values: { title: 'One' } },
      { slug: 'two', locale: 'fr', values: { title: 'Deux' } },
    ]);
    expect(slugFrom('Crème Brûlée & Co!')).toBe('creme-brulee-co');
  });
});
