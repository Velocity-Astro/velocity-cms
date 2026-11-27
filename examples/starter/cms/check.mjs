#!/usr/bin/env node
/**
 * Proves the starter works from nothing, as CI runs it: a new database is seeded, the site is
 * built and started, and its pages, the editor and a form post are asked for.
 *
 *   npm run check
 *
 * With `--workers` (`npm run check:workers`) the same is asked of the site as a Cloudflare Worker:
 * built with the Cloudflare adapter, run in the Workers runtime by Wrangler, on a local D1 database.
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-cms-starter-'));
const port = 4391;
const origin = `http://localhost:${port}`;
const workers = process.argv.includes('--workers');
const secret = randomBytes(32).toString('base64url');
// On Workers the database is the D1 binding of wrangler.jsonc and uploads go to its R2 bucket, both kept for this run in a folder of its own.
const state = path.join(work, 'state');
const database = workers ? { VELOCITY_CMS_DATABASE_URL: 'd1:DB', VELOCITY_CMS_R2_BUCKET: 'MEDIA', VELOCITY_CMS_WRANGLER_STATE: state, CMS_WORKERS: '1' } : { VELOCITY_CMS_DATABASE_URL: `file:${path.join(work, 'data.db')}` };
const env = { ...process.env, ...database, VELOCITY_CMS_SECRET: secret, VELOCITY_CMS_ORIGIN: origin, SITE_URL: origin, PORT: String(port), HOST: '127.0.0.1' };
/** A PNG of soft colours with some grain, as a photo saved as a PNG would be: heavy as it is, light as a WebP. */
function photo(width, height) {
  const part = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([size, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc(height * (1 + width * 3));
  let grain = 7;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      grain = (grain * 1103515245 + 12345) & 0x7fffffff;
      const at = y * (1 + width * 3) + 1 + x * 3;
      rows.set([(x * 255) / width + (grain % 24), (y * 255) / height + ((grain >> 8) % 24), 120 + ((grain >> 16) % 24)].map((value) => Math.min(255, Math.floor(value))), at);
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), part('IHDR', header), part('IDAT', zlib.deflateSync(rows)), part('IEND', Buffer.alloc(0))]);
}

const run = (command, args) => execFileSync(command, args, { cwd: root, env, stdio: 'inherit' });

run('node', ['cms/seed.mjs']);
run('node', ['cms/seed.mjs']);
// An owner, and a token of theirs that may publish, for the check that a publish is on the site at once.
// Made before the site starts: on Workers the command and the site must not hold the local database together.
const cli = (args, more = {}) => execFileSync('npx', ['velocity-cms', ...args], { cwd: root, env: { ...env, ...more }, encoding: 'utf8' });
cli(['owner', 'check@example.com', 'Check']);
const token = /vcms_[\w-]+/.exec(cli(['token', 'the starter check', '--publish']))?.[0] ?? '';
run('npx', ['astro', 'build']);
// Wrangler is started by its own file, not through npx, so that stopping it stops the runtime it started.
const wrangler = () => path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')), 'bin', 'wrangler.js');
const given = (name) => ['--var', `${name}:${env[name]}`];
const server = workers
  ? spawn('node', [wrangler(), 'dev', '--config', 'dist/server/wrangler.json', '--port', String(port), '--persist-to', state, ...given('VELOCITY_CMS_DATABASE_URL'), ...given('VELOCITY_CMS_R2_BUCKET'), ...given('VELOCITY_CMS_SECRET'), ...given('VELOCITY_CMS_ORIGIN')], { cwd: root, env, stdio: 'inherit' })
  : spawn('node', ['dist/server/entry.mjs'], { cwd: root, env, stdio: 'inherit' });
let failed = 0;
const expect = (what, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed += 1;
};
try {
  for (let tries = 0; tries < (workers ? 300 : 50); tries += 1) {
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
  const post = await get('/blog/hello/');
  expect('the post has its page', post.text.includes('This post lives in the CMS.'));
  // Posts take likes: the post draws its share bar, and a like from its page is counted once.
  const liking = /data-cms-like-entry="([^"]+)"/.exec(post.text)?.[1] ?? '';
  expect('the post draws a like button and a share bar', liking !== '' && post.text.includes('data-cms-share="copy"') && (await get('/cms-likes.js')).status === 200);
  const like = (body, from = origin) => fetch(`${origin}/api/cms/likes`, { method: 'POST', headers: { origin: from, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const browser = 'starter-check-browser-0001';
  const first = await (await like({ type: 'posts', entry: liking, browser, liked: true })).json();
  const again = await (await like({ type: 'posts', entry: liking, browser, liked: true })).json();
  expect('a like is counted once', first.count === 1 && again.count === 1 && again.liked === true);
  expect('a like from another site is refused', (await like({ type: 'posts', entry: liking, browser, liked: true }, 'https://elsewhere.example')).status === 403);
  const counted = await (await fetch(`${origin}/api/cms/likes?type=posts&entries=en/hello`)).json();
  expect('the blog is told how many liked each post', counted.counts?.['en/hello'] === 1);
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
  // A publish is on the site at once. The address is asked for first, so that an answer kept from before would show.
  expect('a page nobody made answers 404', (await get('/made-by-the-check/')).status === 404);
  cli(['create', 'pages', 'made-by-the-check', '--data', JSON.stringify({ title: 'Made by the check' }), '--publish'], { VELOCITY_CMS_TOKEN: token });
  const made = await get('/made-by-the-check/');
  expect('a page is on the site as soon as it is published', made.status === 200 && made.text.includes('Made by the check'));
  // An upload is made lighter, kept and served back: in a folder beside the database, or on Workers in the R2 bucket.
  const picture = path.join(work, 'photo.png');
  fs.writeFileSync(picture, photo(480, 320));
  const uploaded = cli(['upload', picture, '--json'], { VELOCITY_CMS_TOKEN: token });
  const image = await fetch(origin + (/"(?:url|src)":\s*"([^"]+)"/.exec(uploaded)?.[1] ?? '/none'));
  expect('an uploaded image is kept and served', image.ok && (image.headers.get('content-type') ?? '').startsWith('image/'));
  expect('and was made lighter on the way in', image.headers.get('content-type') === 'image/webp' && (await image.arrayBuffer()).byteLength < fs.statSync(picture).size);
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
console.log(workers ? '\nThe starter works as a Cloudflare Worker.' : '\nThe starter works.');
