#!/usr/bin/env node
/**
 * Whole-template live pages prototype.
 *
 *   node prototypes/live-site/run.mjs <assembled real-estate project> [--keep]
 *
 * Builds the template as it ships, converts it to live pages reading from the CMS, then checks
 * that every page of the live site says the same as the original and times it. The project is
 * put back at the end unless --keep is given.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importCollection, multiply, openCms, OWNER } from '../publish-speed/lib.mjs';
import { convert } from './convert.mjs';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const projectArg = args.find((arg) => !arg.startsWith('--'));
if (!projectArg) throw new Error('Usage: run.mjs <assembled real-estate project> [--keep]');
const project = path.resolve(projectArg);
const here = path.dirname(fileURLToPath(import.meta.url));
const work = path.join(here, 'work');
const loaderPackage = path.resolve(here, '../../packages/cms-astro');
const PORT = 4399;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const at = (relative) => path.join(project, relative);

const backup = at('.live-prototype-backup');
function restore() {
  if (!fs.existsSync(backup)) return;
  fs.rmSync(at('src'), { recursive: true, force: true });
  fs.cpSync(path.join(backup, 'src'), at('src'), { recursive: true });
  fs.copyFileSync(path.join(backup, 'astro.config.mjs'), at('astro.config.mjs'));
  fs.rmSync(backup, { recursive: true, force: true });
}
restore(); // in case an earlier run was interrupted
fs.mkdirSync(backup);
fs.cpSync(at('src'), path.join(backup, 'src'), { recursive: true });
fs.copyFileSync(at('astro.config.mjs'), path.join(backup, 'astro.config.mjs'));

function build() {
  for (const dir of ['.astro', 'node_modules/.astro', 'dist']) fs.rmSync(at(dir), { recursive: true, force: true });
  const started = performance.now();
  const log = execFileSync('pnpm', ['build'], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
  return { seconds: (performance.now() - started) / 1000, log };
}
const htmlFiles = (dir) => fs.readdirSync(dir, { recursive: true }).map(String).filter((name) => name.endsWith('.html'));

const text = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const links = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]).filter((href) => !href.includes('_astro')).join('\n');
const meta = (html, property) => html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]+)"`))?.[1];

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const ms = (value) => `${value.toFixed(1)} ms`;
async function timed(url, init) {
  const started = performance.now();
  const response = await fetch(url, init);
  const body = await response.text();
  return { ms: performance.now() - started, status: response.status, body, headers: response.headers };
}
async function startServer() {
  const child = spawn('node', ['dist/server/entry.mjs'], {
    cwd: project,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(`${ORIGIN}/robots.txt`);
      return child;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  child.kill();
  throw new Error('The server did not start.');
}
/** Clears the page cache. `search`: 'skip' leaves the index alone, 'wait' answers once it is rebuilt. */
const revalidate = async (search = 'skip') => {
  const response = await fetch(`${ORIGIN}/api/cms-revalidate`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ search }),
  });
  if (!response.ok) throw new Error(`Clearing the cache answered ${response.status}.`);
  return response.json();
};
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
/** Whether any page in the search index on disk contains the word. */
function indexHas(word) {
  const dir = at('dist/client/pagefind/fragment');
  return fs.readdirSync(dir).some((name) => zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString('utf8').includes(word));
}

async function seed(listingCount) {
  fs.rmSync(at('cms'), { recursive: true, force: true });
  fs.mkdirSync(at('cms'), { recursive: true });
  const { cms, close } = await openCms(`file:${at('cms/data.db')}`);
  const types = {};
  for (const name of ['listings', 'agents', 'neighborhoods', 'reviews']) {
    let records = JSON.parse(fs.readFileSync(path.join(backup, `src/content/estate/${name}.json`), 'utf8'));
    if (name === 'listings' && listingCount) records = multiply(records, listingCount);
    types[name] = await importCollection(cms, name, records);
  }
  close();
  return types;
}

let server;
try {
  execFileSync('pnpm', ['add', '-D', `@velocity/cms-astro@link:${loaderPackage}`], { cwd: project, stdio: 'ignore' });

  // 1. The template as it ships: the reference every live page is checked against.
  const original = build();
  const baseline = path.join(work, 'baseline');
  fs.rmSync(baseline, { recursive: true, force: true });
  fs.cpSync(at('dist/client'), baseline, { recursive: true });
  const originalPages = htmlFiles(baseline);
  const sitemapBefore = fs.readdirSync(baseline).filter((name) => /^sitemap-\d+\.xml$/.test(name)).map((name) => fs.readFileSync(path.join(baseline, name), 'utf8')).join('');

  // 2. Convert and build.
  const types = await seed();
  const changes = convert(project);
  const live = build();
  const prerendered = htmlFiles(at('dist/client'));
  const sitemapAfter = fs.readdirSync(at('dist/client')).filter((name) => /^sitemap-\d+\.xml$/.test(name)).map((name) => fs.readFileSync(at(`dist/client/${name}`), 'utf8')).join('');

  // 3. Every page of the original, asked of the live server.
  server = await startServer();
  const firstIndex = (await revalidate('wait')).search;
  const sitemapIndex = await timed(`${ORIGIN}/sitemap-index.xml`);
  const sitemapLive = await timed(`${ORIGIN}/sitemap-live.xml`);
  const liveSitemap = new Set([...locs(sitemapAfter), ...locs(sitemapLive.body)]);
  const wanted = new Set(locs(sitemapBefore));
  const sitemapMissing = [...wanted].filter((address) => !liveSitemap.has(address));
  const sitemapExtra = [...liveSitemap].filter((address) => !wanted.has(address));
  const different = [];
  const missingShareImages = [];
  for (const file of originalPages) {
    if (file === '404.html') continue;
    const url = `/${file.replace(/index\.html$/, '')}`;
    const expected = fs.readFileSync(path.join(baseline, file), 'utf8');
    const got = await timed(`${ORIGIN}${url}`);
    if (got.status !== 200) different.push(`${url} answered ${got.status}`);
    else if (text(got.body) !== text(expected)) different.push(`${url} text differs`);
    else if (links(got.body) !== links(expected)) different.push(`${url} links differ`);
    const image = meta(got.body, 'og:image');
    if (image && !prerendered.includes(file)) {
      const answer = await fetch(`${ORIGIN}${new URL(image).pathname}`);
      if (answer.status !== 200) missingShareImages.push(url);
    }
  }

  // 4. Speed, at the template's own size.
  const sample = { home: '/', 'homes for sale': '/homes-for-sale/', listing: '/listings/lakeshore-farmhouse/', 'listing, Spanish': '/es/propiedades/granja-lakeshore/', agents: '/agents/' };
  const spanishListing = originalPages.find((file) => file.startsWith('es/propiedades/'));
  if (spanishListing) sample['listing, Spanish'] = `/${spanishListing.replace(/index\.html$/, '')}`;
  async function measure() {
    const rows = [];
    for (const [name, url] of Object.entries(sample)) {
      const uncached = [];
      for (let i = 0; i < 5; i++) {
        await revalidate();
        uncached.push((await timed(`${ORIGIN}${url}`)).ms);
      }
      const cached = [];
      for (let i = 0; i < 30; i++) cached.push((await timed(`${ORIGIN}${url}`)).ms);
      rows.push({ name, uncached: median(uncached), cached: median(cached) });
    }
    return rows;
  }
  const small = await measure();
  const cardUrl = `${ORIGIN}/og${sample.listing.replace(/\/$/, '')}.png`;
  await revalidate();
  const cardFirst = await timed(cardUrl);
  const cardCached = median(await Promise.all([1, 2, 3].map(() => timed(cardUrl))).then((runs) => runs.map((run) => run.ms)));

  // 5. Publish: one price change, seen on the listing page, the index and the Spanish page.
  let { cms, close } = await openCms(`file:${at('cms/data.db')}`);
  const priceId = types.listings.fields.find((field) => field.key === 'price').id;
  const group = (await cms.content.find(OWNER, { typeId: types.listings.id, locale: 'en', limit: 1 })).items[0].translationGroup;
  const versions = (await cms.content.find(OWNER, { typeId: types.listings.id, limit: 500 })).items.filter((entry) => entry.translationGroup === group);
  const newPrice = versions[0].data[priceId] + 12345;
  const publishStarted = performance.now();
  for (const entry of versions) {
    await cms.content.update(OWNER, entry.id, { data: { ...entry.data, [priceId]: newPrice }, expectedRevision: entry.revision });
  }
  await revalidate();
  const after = await timed(`${ORIGIN}${sample.listing}`);
  const publishMs = performance.now() - publishStarted;
  close();
  const shown = newPrice.toLocaleString('en-US');
  // 5b. A new street name: the search index and the share image have to follow.
  ({ cms, close } = await openCms(`file:${at('cms/data.db')}`));
  const address = types.listings.fields.find((field) => field.key === 'address');
  const streetId = address.options.fields.find((field) => field.key === 'street').id;
  const english = (await cms.content.find(OWNER, { typeId: types.listings.id, locale: 'en', limit: 500 })).items.find((entry) => entry.translationGroup === group);
  const cardBefore = Buffer.from(await (await fetch(cardUrl)).arrayBuffer());
  const wordBefore = indexHas('Quillfeather');
  await cms.content.update(OWNER, english.id, {
    data: { ...english.data, [address.id]: { ...english.data[address.id], [streetId]: '77 Quillfeather Lane' } },
    expectedRevision: english.revision,
  });
  close();
  const reindex = (await revalidate('wait')).search;
  const wordAfter = indexHas('Quillfeather');
  const cardAfter = Buffer.from(await (await fetch(cardUrl)).arrayBuffer());
  const cardChanged = !cardBefore.equals(cardAfter);
  const seenOn = [];
  for (const [name, url] of Object.entries(sample)) {
    if (name === 'agents') continue;
    const body = name === 'listing' ? after.body : (await timed(`${ORIGIN}${url}`)).body;
    seenOn.push(`${name}: ${body.includes(shown) ? 'yes' : 'no'}`);
  }

  // 6. Speed again with 500 listing entries.
  server.kill();
  await seed(500);
  server = await startServer();
  const large = await measure();
  const largeIndex = (await revalidate('wait')).search;

  // Report
  const drew = (log) => log.match(/Checked share images on (\d+) page\(s\), drew (\d+)/);
  const indexed = (log) => log.match(/Indexed (\d+) page\(s\) for search/)?.[1];
  const count = (xml) => (xml.match(/<loc>/g) ?? []).length;
  console.log(`\nFiles: ${changes.added.length} added, ${changes.moved.length} moved unchanged, ${changes.edited.length} edited.`);
  console.log('\n| | Original | Live |\n|---|---|---|');
  console.log(`| Build time | ${original.seconds.toFixed(1)} s | ${live.seconds.toFixed(1)} s |`);
  console.log(`| Pages built ahead of time | ${originalPages.length} | ${prerendered.length} |`);
  console.log(`| Pages in the search index | ${indexed(original.log)} | ${indexed(live.log)} |`);
  console.log(`| Share images drawn | ${drew(original.log)?.[2]} | ${drew(live.log)?.[2]} |`);
  console.log(`| Addresses in the sitemap | ${count(sitemapBefore)} | ${count(sitemapAfter)} |`);
  console.log(`\nSitemap, live site: ${liveSitemap.size} addresses (index answered ${sitemapIndex.status}, lists sitemap-live.xml: ${sitemapIndex.body.includes('sitemap-live.xml')}). Missing: ${sitemapMissing.length}. Extra: ${sitemapExtra.length}.`);
  for (const line of [...sitemapMissing, ...sitemapExtra].slice(0, 10)) console.log(`  - ${line}`);
  console.log(`Search, live site: ${firstIndex.pages} pages indexed in ${(firstIndex.ms / 1000).toFixed(1)} s after start; ${largeIndex.pages} pages in ${(largeIndex.ms / 1000).toFixed(1)} s with 500 listings.`);
  console.log(`After a street name change: index rebuilt in ${(reindex.ms / 1000).toFixed(1)} s, new name in the index: ${wordBefore ? 'was already there' : wordAfter ? 'yes' : 'no'}, share image redrawn: ${cardChanged ? 'yes' : 'no'}.`);
  console.log(`Share image: ${ms(cardFirst.ms)} to draw (status ${cardFirst.status}), ${ms(cardCached)} from the cache.`);
  console.log(`\nPages compared with the original: ${originalPages.length - 1}. Different: ${different.length}.`);
  for (const line of different.slice(0, 20)) console.log(`  - ${line}`);
  console.log(`Live pages whose share image is missing: ${missingShareImages.length}.`);
  console.log(`\nPublish: price changed in both languages and visible on the listing page ${ms(publishMs)} later. Seen on: ${seenOn.join(', ')}.`);
  console.log('\n| Page | Not cached, 32 listings | Cached, 32 | Not cached, 500 listings | Cached, 500 |\n|---|---|---|---|---|');
  small.forEach((row, index) => console.log(`| ${row.name} | ${ms(row.uncached)} | ${ms(row.cached)} | ${ms(large[index].uncached)} | ${ms(large[index].cached)} |`));
  console.log('\nEdited files:');
  for (const file of changes.edited) console.log(`  - ${file}`);
} finally {
  server?.kill();
  if (!keep) restore();
}
