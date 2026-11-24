#!/usr/bin/env node
/**
 * Proves the starter works from nothing, as CI runs it: a new database is seeded, the site is
 * built and started, and its pages, the editor and a form post are asked for.
 *
 *   npm run check
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-cms-starter-'));
const port = 4391;
const origin = `http://localhost:${port}`;
const env = { ...process.env, VELOCITY_CMS_DATABASE_URL: `file:${path.join(work, 'data.db')}`, VELOCITY_CMS_SECRET: randomBytes(32).toString('base64url'), VELOCITY_CMS_ORIGIN: origin, SITE_URL: origin, PORT: String(port), HOST: '127.0.0.1' };
const run = (command, args) => execFileSync(command, args, { cwd: root, env, stdio: 'inherit' });

run('node', ['cms/seed.mjs']);
run('node', ['cms/seed.mjs']);
run('npx', ['astro', 'build']);
const server = spawn('node', ['dist/server/entry.mjs'], { cwd: root, env, stdio: 'inherit' });
let failed = 0;
const expect = (what, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed += 1;
};
try {
  for (let tries = 0; tries < 50; tries += 1) {
    if (await fetch(origin).then((response) => response.ok, () => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const get = async (address) => {
    const response = await fetch(origin + address, { redirect: 'manual' });
    return { status: response.status, text: await response.text() };
  };
  const home = await get('/');
  expect('the home page is drawn from its sections', home.status === 200 && home.text.includes('This page is yours to edit.') && home.text.includes('What is here'));
  expect('the menu comes from the CMS', home.text.includes('href="/contact/"'));
  const contact = await get('/contact/');
  expect('the contact page draws the form', contact.status === 200 && contact.text.includes('data-cms-form') && contact.text.includes('name="email"'));
  expect('the blog lists the post', (await get('/blog/')).text.includes('href="/blog/hello/"'));
  expect('the post has its page', (await get('/blog/hello/')).text.includes('This post lives in the CMS.'));
  expect('an address with no page answers 404', (await get('/nothing-here/')).status === 404);
  expect('the editor is served', (await get('/admin')).status === 200);
  expect('nobody is signed in', (await get('/api/cms/session')).text.includes('null'));
  expect('the API refuses a stranger', (await get('/api/cms/entries?type=pages')).status === 401);
  // An app given only the MCP address finds its own way to sign-in, registers and is sent on to the editor.
  const mcp = await fetch(`${origin}/api/cms/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) });
  const found = /resource_metadata="([^"]+)"/.exec(mcp.headers.get('www-authenticate') ?? '')?.[1] ?? '';
  expect('the MCP server tells an app where to sign in', mcp.status === 401 && found === `${origin}/.well-known/oauth-protected-resource/api/cms/mcp`);
  const resource = await fetch(found).then((response) => response.json(), () => ({}));
  expect('it names the server apps sign in with', resource.resource === `${origin}/api/cms/mcp` && resource.authorization_servers?.[0] === origin);
  const oauth = await fetch(`${origin}/.well-known/oauth-authorization-server`).then((response) => response.json(), () => ({}));
  expect('that server says where an app registers', oauth.registration_endpoint === `${origin}/api/cms/oauth/register` && oauth.code_challenge_methods_supported?.includes('S256'));
  const callback = 'https://app.example/callback';
  const app = await fetch(oauth.registration_endpoint ?? origin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Check', redirect_uris: [callback] }) }).then((response) => response.json(), () => ({}));
  const asked = new URLSearchParams({ response_type: 'code', client_id: app.client_id ?? '', redirect_uri: callback, code_challenge: 'c'.repeat(43), code_challenge_method: 'S256', state: 's' });
  const approval = await fetch(`${oauth.authorization_endpoint}?${asked}`, { redirect: 'manual' });
  expect('an app that registered is sent to the editor to be approved', approval.status === 302 && approval.headers.get('location') === `${origin}/admin/connect?${asked}`);
  expect('the approval screen is the editor', (await get(`/admin/connect?${asked}`)).status === 200);
  // An app posts a form from its own server, with no page behind it: the site must take that, and refuse the code.
  const traded = await fetch(oauth.token_endpoint ?? origin, { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code: 'vcms_code_none', client_id: app.client_id ?? '', code_verifier: 'v'.repeat(43) }) });
  expect('a code nobody was given gets no token', traded.status === 400 && (await traded.json()).error === 'invalid_grant');
  expect('the sitemap lists the pages', (await get('/sitemap-live.xml')).text.includes('/contact/'));
  // A post with no true mark of when its form was drawn is taken and kept as spam, and answered like any other.
  const action = /<form action="([^"]+)"/.exec(contact.text)?.[1] ?? '';
  const hidden = [...contact.text.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map(([, name, value]) => [name, value]);
  const sent = await fetch(new URL(action, origin), { method: 'POST', headers: { origin, accept: 'application/json' }, body: new URLSearchParams([...hidden, ['name', 'Tom'], ['email', 'tom@example.com'], ['message', 'Hello.']]) });
  expect('the form takes a post', sent.ok);
} finally {
  server.kill();
  fs.rmSync(work, { recursive: true, force: true });
}
if (failed > 0) {
  console.error(`\n${failed} check${failed === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nThe starter works.');
