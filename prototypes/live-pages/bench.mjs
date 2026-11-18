#!/usr/bin/env node
/**
 * Live pages prototype.
 *
 *   node prototypes/live-pages/bench.mjs <assembled real-estate project> [entries=500]
 *
 * Turns the English listing page of the real estate template into a page rendered on demand
 * from the CMS and cached, then measures how fast it is served and how long a published change
 * takes to show. Every file it changes in the project is put back at the end.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importCollection, multiply, openCms, OWNER } from '../publish-speed/lib.mjs';

const [projectArg, entriesArg = '500'] = process.argv.slice(2);
if (!projectArg) throw new Error('Usage: bench.mjs <assembled real-estate project> [entries]');
const project = path.resolve(projectArg);
const target = Number(entriesArg);
const loaderPackage = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages/cms-astro');
const PORT = 4399;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const file = (relative) => path.join(project, relative);
const touched = new Map();
function write(relative, content) {
  if (!touched.has(relative)) touched.set(relative, fs.existsSync(file(relative)) ? fs.readFileSync(file(relative), 'utf8') : null);
  fs.mkdirSync(path.dirname(file(relative)), { recursive: true });
  fs.writeFileSync(file(relative), content);
}
function restore() {
  for (const [relative, content] of touched) {
    if (content === null) fs.rmSync(file(relative), { force: true });
    else fs.writeFileSync(file(relative), content);
  }
}

const LIVE_CONFIG = `import { defineLiveCollection } from 'astro:content';
import { cmsLiveLoader } from '@velocity-astro/cms-astro';

// No schema here: this file must not import anything that imports astro:content, or the build
// hangs on the circular import. The page checks the entry against the template's schema instead.
export const collections = {
  liveListings: defineLiveCollection({ loader: cmsLiveLoader({ type: 'listings' }) }),
};
`;

const LISTING_PAGE = `---
import { getLiveCollection } from 'astro:content';
import ListingView from '@/views/ListingView.astro';
import { siteCollections } from '@/config/collections';
import { defaultLocale } from '@/i18n';

export const prerender = false;

const { entries, error } = await getLiveCollection('liveListings', { locale: defaultLocale });
if (error) throw error;
const found = entries?.find((candidate) => candidate.data.path === Astro.params.slug);
if (!found) return new Response(null, { status: 404 });
// The same Zod schema the build-time collection uses, so defaults and checks still apply.
const entry = { ...found, data: siteCollections.listings.schema.parse(found.data) };

// Cached until a publish clears the tag. A day is the backstop, not the refresh rate.
Astro.cache.set({ maxAge: 86400, tags: ['cms:listings'] });
---

<ListingView locale={defaultLocale} listing={entry} />
`;

const REVALIDATE = `import type { APIRoute } from 'astro';

export const prerender = false;

// Stands in for the editor's publish handler, which will run in this same server.
export const POST: APIRoute = async ({ cache }) => {
  await cache.invalidate({ tags: ['cms:listings'] });
  return new Response('ok');
};
`;

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const ms = (value) => `${value.toFixed(1)} ms`;

async function timed(url, init) {
  const started = performance.now();
  const response = await fetch(url, init);
  const body = await response.text();
  return { ms: performance.now() - started, status: response.status, body, headers: response.headers };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(`${ORIGIN}/about/`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('The server did not start.');
}

let server;
try {
  execFileSync('pnpm', ['add', '-D', `@velocity-astro/cms-astro@link:${loaderPackage}`], { cwd: project, stdio: 'ignore' });

  // Content: the template's listings, copied up to the target size, published in the CMS.
  const records = multiply(JSON.parse(fs.readFileSync(file('src/content/estate/listings.json'), 'utf8')), target);
  fs.rmSync(file('cms'), { recursive: true, force: true });
  fs.mkdirSync(file('cms'), { recursive: true });
  const dbUrl = `file:${file('cms/data.db')}`;
  let { cms, close } = await openCms(dbUrl);
  const type = await importCollection(cms, 'listings', records);
  close();

  const config = fs.readFileSync(file('astro.config.mjs'), 'utf8');
  write('astro.config.mjs', `import velocityCms from '@velocity-astro/cms-astro';\n${config.replace('  integrations: [', '  integrations: [\n    velocityCms(),')}`);
  write('src/live.config.ts', LIVE_CONFIG);
  write('src/pages/listings/[slug].astro', LISTING_PAGE);
  write('src/pages/api/cms-revalidate.ts', REVALIDATE);

  for (const dir of ['.astro', 'node_modules/.astro', 'dist']) fs.rmSync(file(dir), { recursive: true, force: true });
  const buildStarted = performance.now();
  execFileSync('pnpm', ['build'], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'], timeout: 240_000 });
  const buildSeconds = (performance.now() - buildStarted) / 1000;
  const pages = fs.readdirSync(file('dist'), { recursive: true }).filter((name) => String(name).endsWith('.html')).length;

  server = spawn('node', ['dist/server/entry.mjs'], {
    cwd: project,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await waitForServer();

  const slug = records.find((record) => record.locale === 'en').path;
  const page = `${ORIGIN}/listings/${slug}/`;
  const revalidate = async () => {
    const response = await fetch(`${ORIGIN}/api/cms-revalidate`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error(`Clearing the cache answered ${response.status}.`);
  };

  const first = await timed(page);
  if (first.status !== 200) throw new Error(`The live page answered ${first.status}.`);

  const cached = [];
  for (let i = 0; i < 50; i++) cached.push((await timed(page)).ms);

  const uncached = [];
  for (let i = 0; i < 10; i++) {
    await revalidate();
    uncached.push((await timed(page)).ms);
  }

  const prerendered = [];
  for (let i = 0; i < 50; i++) prerendered.push((await timed(`${ORIGIN}/about/`)).ms);

  // What an owner does: change a price and publish. How long until a visitor sees it?
  ({ cms, close } = await openCms(dbUrl));
  const entry = (await cms.content.find(OWNER, { typeId: type.id, locale: 'en', limit: 1 })).items[0];
  const priceId = type.fields.find((field) => field.key === 'price').id;
  const newPrice = entry.data[priceId] + 12345;
  const before = await timed(page);
  const publishStarted = performance.now();
  await cms.content.update(OWNER, entry.id, { data: { ...entry.data, [priceId]: newPrice }, expectedRevision: entry.revision });
  await cms.content.publish(OWNER, entry.id);
  await revalidate();
  const after = await timed(page);
  const publishMs = performance.now() - publishStarted;
  close();
  const shown = (body) => body.includes(newPrice.toLocaleString('en-US'));
  if (shown(before.body) || !shown(after.body)) throw new Error('The edited price did not appear as expected.');

  const missing = await timed(`${ORIGIN}/listings/no-such-home/`);

  console.log(`\nBuilt in ${buildSeconds.toFixed(1)}s with ${pages} prerendered pages; ${records.length} entries in the CMS.\n`);
  console.log('| Measurement | Result |\n|---|---|');
  console.log(`| Prerendered page (/about/), median of 50 | ${ms(median(prerendered))} |`);
  console.log(`| Live listing page, first request after start | ${ms(first.ms)} |`);
  console.log(`| Live listing page, not cached, median of 10 | ${ms(median(uncached))} |`);
  console.log(`| Live listing page, cached, median of 50 | ${ms(median(cached))} |`);
  console.log(`| Save, clear cache, and see the new price on the page | ${ms(publishMs)} |`);
  console.log(`| Listing that does not exist | status ${missing.status} |`);
  console.log(`| Cache header on the live page | ${first.headers.get('cache-control') ?? first.headers.get('cdn-cache-control') ?? 'none'} |`);
} finally {
  server?.kill();
  restore();
}
