#!/usr/bin/env node
/**
 * Proves that one running copy of this site can serve two sites and keep them apart, as a host
 * that runs many sites needs: each has its own database, secret, address and uploads, and a
 * host name nobody registered has no site.
 *
 *   npm run check:hosted
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-cms-hosted-'));
const port = 4392;
const site = (id) => ({
  id,
  host: `${id}.test:${port}`,
  origin: `http://${id}.test:${port}`,
  name: id,
  database: { url: `file:${path.join(work, id, 'data.db')}` },
  secret: randomBytes(32).toString('base64url'),
  media: path.join(work, id, 'media'),
});
const [harbor, orchard] = [site('harbor'), site('orchard')];

// Nothing of one site is in the server's settings: only the list of sites is.
const { VELOCITY_CMS_DATABASE_URL: _url, VELOCITY_CMS_SECRET: _secret, VELOCITY_CMS_ORIGIN: _origin, ...clean } = process.env;
const env = { ...clean, CMS_SITES: './cms/check-sites.mjs', CMS_CHECK_SITES: JSON.stringify([harbor, orchard]), SITE_URL: 'http://the-template.test', PORT: String(port), HOST: '127.0.0.1' };
const run = (command, args, extra = {}) => execFileSync(command, args, { cwd: root, env: { ...clean, ...extra }, stdio: 'inherit' });
/** Work on one site's database from outside the server, as a host's own tools would do it. */
const on = (hosted, script) => execFileSync('node', ['--input-type=module', '-e', script], { cwd: root, env: { ...clean, VELOCITY_CMS_DATABASE_URL: hosted.database.url }, encoding: 'utf8' }).trim();

// A new site is a new database filled with the sample content. Orchard then gets a page of its own.
for (const hosted of [harbor, orchard]) run('node', ['cms/seed.mjs'], { VELOCITY_CMS_DATABASE_URL: hosted.database.url });
on(orchard, `
  import { randomUUID } from 'node:crypto';
  import { sharedConnection } from '@velocity-astro/cms-astro';
  import { toStoredData } from '@velocity-astro/cms-core';
  const owner = { kind: 'cli', id: 'check', role: 'owner' };
  const { cms } = await sharedConnection({});
  const pages = await cms.schema.getByKey('pages');
  const draft = await cms.content.create(owner, { typeId: pages.id, locale: 'en', slug: 'only-orchard', data: toStoredData(pages.fields, { title: 'Only at the orchard', body: [] }, randomUUID) });
  await cms.content.publish(owner, draft.id);
`);
const submissions = (hosted) => Number(on(hosted, `
  import { sharedConnection } from '@velocity-astro/cms-astro';
  const owner = { kind: 'cli', id: 'check', role: 'owner' };
  const { cms } = await sharedConnection({});
  let count = 0;
  for (const form of await cms.forms.list(owner)) count += (await cms.submissions.find(owner, { formId: form.id })).total;
  console.log(count);
`));

execFileSync('npx', ['astro', 'build'], { cwd: root, env, stdio: 'inherit' });
const server = spawn('node', ['dist/server/entry.mjs'], { cwd: root, env, stdio: 'inherit' });
let failed = 0;
const expect = (what, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed += 1;
};
/** One request to the server, saying which host it is for, as a host's network would pass it on. */
const ask = (host, address, { method = 'GET', headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: address, method, headers: { host, ...headers } }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (part) => (text += part));
      response.on('end', () => resolve({ status: response.statusCode, text, headers: response.headers }));
    });
    request.on('error', reject);
    request.end(body);
  });
try {
  for (let tries = 0; tries < 50; tries += 1) {
    if (await ask(harbor.host, '/').then((response) => response.status === 200, () => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const page = '/only-orchard/';
  expect('each site draws its own home page', (await ask(harbor.host, '/')).status === 200 && (await ask(orchard.host, '/')).status === 200);
  expect('a page of one site is a page there', (await ask(orchard.host, page)).text.includes('Only at the orchard'));
  expect('and is no page on the other', (await ask(harbor.host, page)).status === 404);
  // A second time, from the kept pages: one site's kept page is never handed to the other.
  expect('also once pages are kept', (await ask(orchard.host, page)).status === 200 && (await ask(harbor.host, page)).status === 404);
  expect('each sitemap lists its own pages', (await ask(orchard.host, '/sitemap-live.xml')).text.includes(page) && !(await ask(harbor.host, '/sitemap-live.xml')).text.includes(page));
  expect('a sitemap is made for its site\'s address', (await ask(orchard.host, '/sitemap-live.xml')).text.includes(`${orchard.origin}${page}`));

  const nowhere = await ask(`nobody.test:${port}`, '/');
  expect('a host name nobody registered has no site', nowhere.status === 404 && nowhere.text.includes('no site'));
  expect('nor an editor, nor an API', (await ask(`nobody.test:${port}`, '/admin')).status === 404 && (await ask(`nobody.test:${port}`, '/api/cms/session')).status === 404);

  expect('each site serves the editor', (await ask(harbor.host, '/admin')).status === 200 && (await ask(orchard.host, '/admin')).status === 200);
  expect('the API refuses a stranger on each', (await ask(harbor.host, '/api/cms/entries?type=pages')).status === 401 && (await ask(orchard.host, '/api/cms/entries?type=pages')).status === 401);

  // The timer's address takes the site's own secret, and no other site's.
  const timer = (hosted, secret) => ask(hosted.host, '/api/cms/schedule', { method: 'POST', headers: { authorization: `Bearer ${secret}` } });
  expect('a site\'s secret works on that site', (await timer(harbor, harbor.secret)).status < 300);
  expect('and opens nothing on the other', (await timer(orchard, harbor.secret)).status >= 400);

  // A form posted to one site is kept in that site's database alone.
  const contact = await ask(harbor.host, '/contact/');
  const action = /<form action="([^"]+)"/.exec(contact.text)?.[1] ?? '';
  const hidden = [...contact.text.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map(([, name, value]) => [name, value]);
  const sent = await ask(harbor.host, action, {
    method: 'POST',
    headers: { origin: harbor.origin, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams([...hidden, ['name', 'Tom'], ['email', 'tom@example.com'], ['message', 'Hello.']]).toString(),
  });
  expect('a site takes a form post', sent.status === 200);
  server.kill();
  expect('and keeps it in its own database only', submissions(harbor) === 1 && submissions(orchard) === 0);
} finally {
  server.kill();
  fs.rmSync(work, { recursive: true, force: true });
}
if (failed > 0) {
  console.error(`\n${failed} check${failed === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nTwo sites run from one copy, and stay apart.');
