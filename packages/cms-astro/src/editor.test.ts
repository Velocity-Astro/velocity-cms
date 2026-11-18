import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Actor } from '@velocity/cms-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from './cli.js';
import { connect, type Connection } from './connection.js';
import { EditorHost, LogMailer } from './editor.js';
import { editorOrigin, EditorNotSetUpError } from './site-editor.js';
import { allPlugins, registerSitePlugins } from './site-plugins.js';

const ORIGIN = 'https://site.test';
const SECRET = 'a-test-secret-that-is-long-enough-0123456789';
const installer: Actor = { kind: 'cli', id: 'installer', role: 'owner' };

let directory: string;
let connection: Connection;
let host: EditorHost;
let log: string[];

const get = (address: string, init: RequestInit = {}) => new Request(`${ORIGIN}${address}`, init);
const json = (address: string, cookie: string, body: unknown, method = 'POST') =>
  get(address, { method, headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Creates the first owner and opens their link as a browser would. Returns the session cookie. */
async function signIn(): Promise<string> {
  const { link } = await host.auth.createFirstOwner({ email: 'dana@example.com', name: 'Dana' });
  const response = await host.signIn(new Request(link, { redirect: 'manual' }));
  expect(response.headers.get('location')).toBe(`${ORIGIN}/admin`);
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-cms-editor-'));
  fs.mkdirSync(path.join(directory, 'assets'));
  fs.writeFileSync(path.join(directory, 'index.html'), '<html><head><!--velocity-cms--><script type="module" src="./assets/index-abc.js"></script></head></html>');
  fs.writeFileSync(path.join(directory, 'assets/index-abc.js'), 'console.log("editor")');
  fs.writeFileSync(path.join(directory, 'notes.txt'), 'not for visitors');
  connection = await connect({ url: ':memory:' });
  log = [];
  host = new EditorHost({
    connection,
    secret: SECRET,
    origin: ORIGIN,
    siteName: 'Lakeshore </script> Realty',
    mailer: new LogMailer((line) => log.push(line)),
    editorDirectory: directory,
  });
});
afterEach(() => {
  connection.close();
  fs.rmSync(directory, { recursive: true });
});

describe('the plugins that come with the CMS', () => {
  it('are on every site, switched off, after the site\'s own, which win a name', () => {
    expect(allPlugins().map((plugin) => (plugin as { name: string }).name)).toEqual(['seo', 'webhooks', 'mailchimp']);
    const own = { name: 'seo', apiVersion: 1, label: { en: 'Our SEO' }, setup: () => undefined };
    registerSitePlugins([{ name: 'publish-log' }, own]);
    expect(allPlugins().map((plugin) => (plugin as { name: string }).name)).toEqual(['publish-log', 'seo', 'webhooks', 'mailchimp']);
    expect(allPlugins()[1]).toBe(own);
    registerSitePlugins([]);
    expect(allPlugins()[0]).toMatchObject({ name: 'seo', enabledByDefault: false });
  });
});

describe('a plugin\'s editor file', () => {
  const plugin = { name: 'publish-log', apiVersion: 1, label: { en: 'Publish log' }, editor: 'export default () => {};', setup: () => undefined };

  it('is served beside the editor while the plugin is on, as a script and never kept', async () => {
    await connection.cms.plugins.load([plugin]);
    const file = await host.admin(get('/admin/plugins/publish-log.js'));
    expect(await file.text()).toBe('export default () => {};');
    expect(file.headers.get('content-type')).toContain('text/javascript');
    expect(file.headers.get('cache-control')).toBe('no-store');
    expect((await host.admin(get('/admin/plugins/publish-log.js', { method: 'POST' }))).status).toBe(405);

    await connection.cms.plugins.setEnabled(installer, 'publish-log', false);
    expect((await host.admin(get('/admin/plugins/publish-log.js'))).status).toBe(404);
  });

  it('is never the editor\'s page: a plugin nobody installed has nothing there', async () => {
    const missing = await host.admin(get('/admin/plugins/nothing.js'));
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('');
    // The Plugins screen keeps its own address.
    expect((await host.admin(get('/admin/plugins'))).headers.get('content-type')).toContain('text/html');
  });
});

describe('the editor\'s page', () => {
  it('is served at every address under /admin, with the site\'s settings and nothing cacheable', async () => {
    for (const address of ['/admin', '/admin/', '/admin/content/listings/e1', '/admin/notes.txt']) {
      const response = await host.admin(get(address));
      const page = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(page).toContain('<base href="/admin/" />');
      expect(page).toContain('"apiPath":"/api/cms","authPath":"/api/cms/auth"');
      // The site's name cannot end the settings block and start a script of its own.
      expect(page).not.toContain('</script> Realty');
    }
  });

  it('serves the files it was built with, to be kept, and nothing else', async () => {
    const file = await host.admin(get('/admin/assets/index-abc.js'));
    expect(await file.text()).toBe('console.log("editor")');
    expect(file.headers.get('content-type')).toContain('text/javascript');
    expect(file.headers.get('cache-control')).toContain('immutable');
    expect((await host.admin(get('/admin/assets/missing.js'))).status).toBe(404);
    expect((await host.admin(get('/admin/assets/../../package.json'))).headers.get('content-type')).not.toContain('json');
    expect((await host.admin(get('/admin', { method: 'POST' }))).status).toBe(405);
  });

  it('says how to build the editor when it has not been built', () => {
    expect(() => new EditorHost({ connection, secret: SECRET, origin: ORIGIN, siteName: 'x', mailer: new LogMailer(), editorDirectory: path.join(directory, 'nowhere') })).toThrow(/build:app/);
  });
});

describe('signing in and publishing', () => {
  it('refuses the API until someone signs in, then answers as that person', async () => {
    expect((await host.api(get('/api/cms/content-types'))).status).toBe(401);
    const cookie = await signIn();
    const session = (await (await host.api(get('/api/cms/session', { headers: { cookie } }))).json()) as { user: { email: string } };
    expect(session.user.email).toBe('dana@example.com');
  });

  it('remembers the pages a publish changed, at their old and new addresses, once', async () => {
    const type = await connection.cms.schema.create(installer, {
      key: 'listings',
      kind: 'collection',
      label: { en: 'Listings' },
      urlPattern: '/listings/[slug]',
      fields: [{ key: 'title', type: 'text', label: { en: 'Title' }, required: true }],
    });
    const title = type.fields[0]?.id ?? '';
    const cookie = await signIn();

    const created = await host.api(json('/api/cms/entries', cookie, { type: 'listings', slug: 'lakeshore', data: { [title]: 'Lakeshore Drive' } }));
    expect(created.status).toBe(201);
    const entry = (await created.json()) as { id: string; revision: number };
    expect(host.takePublished()).toBeNull();

    await host.api(json(`/api/cms/entries/${entry.id}/publish`, cookie, { expectedRevision: entry.revision }));
    expect(host.takePublished()).toEqual(['/listings/lakeshore/']);
    expect(host.takePublished()).toBeNull();

    const moved = await host.api(json(`/api/cms/entries/${entry.id}`, cookie, { slug: 'lakeshore-drive', data: { [title]: 'Lakeshore Drive' }, expectedRevision: entry.revision + 1 }, 'PATCH'));
    expect(moved.status).toBe(200);
    const saved = (await moved.json()) as { revision: number };
    await host.api(json(`/api/cms/entries/${entry.id}/publish`, cookie, { expectedRevision: saved.revision }));
    expect(host.takePublished()?.sort()).toEqual(['/listings/lakeshore-drive/', '/listings/lakeshore/']);

    await host.api(json(`/api/cms/entries/${entry.id}/unpublish`, cookie, {}));
    expect(host.takePublished()).toEqual(['/listings/lakeshore-drive/']);
  });

  it('takes the pages of an archived type off the site, and puts them back when it is restored', async () => {
    const type = await connection.cms.schema.create(installer, {
      key: 'listings',
      kind: 'collection',
      label: { en: 'Listings' },
      urlPattern: '/listings/[slug]',
      fields: [{ key: 'title', type: 'text', label: { en: 'Title' } }],
    });
    const cookie = await signIn();
    const created = await host.api(json('/api/cms/entries', cookie, { type: 'listings', slug: 'lakeshore', data: {} }));
    const entry = (await created.json()) as { id: string; revision: number };
    await host.api(json('/api/cms/entries', cookie, { type: 'listings', slug: 'a-draft', data: {} }));
    await host.api(json(`/api/cms/entries/${entry.id}/publish`, cookie, { expectedRevision: entry.revision }));
    host.takePublished();

    expect((await host.api(json(`/api/cms/content-types/${type.id}`, cookie, {}, 'DELETE'))).status).toBe(200);
    // Only pages visitors could see are read again: the draft never had one.
    expect(host.takePublished()).toEqual(['/listings/lakeshore/']);
    expect((await host.api(json(`/api/cms/content-types/${type.id}/restore`, cookie, {}))).status).toBe(200);
    expect(host.takePublished()).toEqual(['/listings/lakeshore/']);
  });

  it('prints a sign-in link to the log when the site has no mailer', async () => {
    await signIn();
    await host.signIn(json('/api/cms/auth/sign-in/magic-link', '', { email: 'dana@example.com', callbackURL: '/admin' }));
    expect(log).toHaveLength(1);
    expect(log[0]).toContain(`${ORIGIN}/api/cms/auth/magic-link/verify`);
  });

  it('reports a publish even when the type has no address pattern, so the page cache is still cleared', async () => {
    const type = await connection.cms.schema.create(installer, {
      key: 'reviews',
      kind: 'collection',
      label: { en: 'Reviews' },
      fields: [{ key: 'quote', type: 'text', label: { en: 'Quote' } }],
    });
    const cookie = await signIn();
    const created = await host.api(json('/api/cms/entries', cookie, { type: 'reviews', slug: 'first', data: { [type.fields[0]?.id ?? '']: 'Lovely' } }));
    const entry = (await created.json()) as { id: string; revision: number };
    await host.api(json(`/api/cms/entries/${entry.id}/publish`, cookie, { expectedRevision: entry.revision }));
    expect(host.takePublished()).toEqual([]);
  });

  it('reports a change to a form, so a kept page that draws it is cleared', async () => {
    const form = await connection.cms.forms.create(installer, { key: 'contact', label: { en: 'Contact' }, fields: [{ key: 'email', type: 'email', label: { en: 'Email' } }] });
    expect(host.takePublished()).toEqual([]);
    expect(host.takePublished()).toBeNull();
    await connection.cms.forms.update(installer, form.id, { open: false, expectedRevision: form.revision });
    expect(host.takePublished()).toEqual([]);
    await connection.cms.forms.trash(installer, form.id);
    expect(host.takePublished()).toEqual([]);
  });
});

describe('the address links are made for', () => {
  const request = new Request('https://attacker.test/api/cms/auth/sign-in/magic-link');

  it('is the configured site on a deployed site, whatever host the request names', () => {
    expect(editorOrigin(request, { site: 'https://lakeshore.example/blog/', dev: false })).toBe('https://lakeshore.example');
  });

  it('is the address being used while developing', () => {
    expect(editorOrigin(new Request('http://localhost:4321/admin'), { site: 'https://lakeshore.example', dev: true })).toBe('http://localhost:4321');
  });

  it('is refused, with what to set, when a deployed site has no address', () => {
    expect(() => editorOrigin(request, { site: undefined, dev: false })).toThrow(EditorNotSetUpError);
  });
});

describe('the velocity-cms command', () => {
  const env = { VELOCITY_CMS_SECRET: SECRET, VELOCITY_CMS_ORIGIN: ORIGIN, VELOCITY_CMS_DATABASE_URL: ':memory:' };
  const run = async (args: string[], environment: Record<string, string> = env) => {
    const lines: string[] = [];
    return { code: await runCli(args, { env: environment, print: (line) => lines.push(line) }), output: lines.join('\n') };
  };

  it('creates the first owner and prints a link that signs them in', async () => {
    const { code, output } = await run(['owner', 'dana@example.com', 'Dana', 'Whitfield']);
    expect(code).toBe(0);
    expect(output).toContain('Dana Whitfield <dana@example.com>');
    expect(output).toContain(`${ORIGIN}/api/cms/auth/magic-link/verify?token=`);
  });

  it('refuses to print a link for someone who has no access', async () => {
    const { code, output } = await run(['link', 'stranger@example.com']);
    expect(code).toBe(1);
    expect(output).not.toContain('token=');
  });

  it('says what is missing instead of guessing', async () => {
    expect((await run(['owner', 'dana@example.com'])).code).toBe(1);
    expect((await run(['owner', 'not-an-address', 'Dana'])).output).toContain('email address');
    const { code, output } = await run(['owner', 'dana@example.com', 'Dana'], { VELOCITY_CMS_SECRET: SECRET });
    expect(code).toBe(1);
    expect(output).toContain('VELOCITY_CMS_ORIGIN is not set');
  });
});
