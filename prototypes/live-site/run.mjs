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
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PreviewLinks } from '../../packages/cms-core/dist/index.js';
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
const PREVIEW_SECRET = randomBytes(32).toString('hex');

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
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), VELOCITY_CMS_SECRET: PREVIEW_SECRET },
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
/** Clears the page cache. `reindex`: the pages to read again for search, or 'all'. */
const revalidate = async (reindex) => {
  const response = await fetch(`${ORIGIN}/api/cms/published`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', authorization: `Bearer ${PREVIEW_SECRET}` },
    body: JSON.stringify({ reindex }),
  });
  if (!response.ok) throw new Error(`Clearing the cache answered ${response.status}.`);
  return response.json();
};
const find = async (query, lang = 'en-US') => (await fetch(`${ORIGIN}/api/cms/search.json?q=${encodeURIComponent(query)}&lang=${lang}`)).json();
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
/** The search page in a real browser: type nothing, arrive with a query, read what it shows. */
async function searchInBrowser(query) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const problems = [];
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()));
    page.on('pageerror', (error) => problems.push(error.message));
    await page.goto(`${ORIGIN}/search/?q=${encodeURIComponent(query)}`);
    await page.waitForSelector('#search-results li', { timeout: 10_000 });
    return {
      status: await page.textContent('#search-status'),
      first: await page.textContent('#search-results li a'),
      marked: await page.locator('#search-results mark').count(),
      problems,
    };
  } finally {
    await browser.close();
  }
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
  const firstIndex = (await revalidate('all')).search;
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
    await cms.content.publish(OWNER, entry.id);
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
  const wordBefore = (await find('quillfeather')).total;
  await cms.content.update(OWNER, english.id, {
    data: { ...english.data, [address.id]: { ...english.data[address.id], [streetId]: '77 Quillfeather Lane' } },
    expectedRevision: english.revision,
  });
  await cms.content.publish(OWNER, english.id);
  close();
  const reindex = (await revalidate([sample.listing])).search;
  const wordAfter = await find('quillfeather');
  const inBrowser = await searchInBrowser('quillfeather');
  const cardAfter = Buffer.from(await (await fetch(cardUrl)).arrayBuffer());
  const cardChanged = !cardBefore.equals(cardAfter);
  const seenOn = [];
  for (const [name, url] of Object.entries(sample)) {
    if (name === 'agents') continue;
    const body = name === 'listing' ? after.body : (await timed(`${ORIGIN}${url}`)).body;
    seenOn.push(`${name}: ${body.includes(shown) ? 'yes' : 'no'}`);
  }

  // 5c. Drafts: an edit to a published listing and a brand-new listing, saved but not published.
  ({ cms, close } = await openCms(`file:${at('cms/data.db')}`));
  const current = await cms.content.get(OWNER, english.id);
  const draftPrice = newPrice + 700007;
  const draftShown = draftPrice.toLocaleString('en-US');
  await cms.content.update(OWNER, current.id, { data: { ...current.data, [priceId]: draftPrice }, expectedRevision: current.revision });
  const pathId = types.listings.fields.find((field) => field.key === 'path').id;
  await cms.content.create(OWNER, {
    typeId: types.listings.id,
    locale: 'en',
    slug: 'draft-only-home',
    data: { ...current.data, [pathId]: 'draft-only-home', [address.id]: { ...current.data[address.id], [streetId]: '1 Unpublished Way' } },
  });
  close();
  const signer = new PreviewLinks(PREVIEW_SECRET);
  const token = await signer.issue(60);
  const expired = await signer.issue(-1);
  const forged = await new PreviewLinks(randomBytes(32).toString('hex')).issue(60);
  const newPage = '/listings/draft-only-home/';
  const sees = async (url, init) => {
    const answer = await timed(`${ORIGIN}${url}`, init);
    return { status: answer.status, edit: answer.body.includes(draftShown), fresh: answer.body.includes('1 Unpublished Way'), headers: answer.headers };
  };
  const preview = {};
  preview.publicBefore = [await sees(sample.listing), await sees(newPage), await sees(sample['homes for sale'])];
  preview.byLink = await sees(`${sample.listing}?preview=${token}`);
  // The list is rendered by a component deep in the page, and was cached for visitors a moment ago.
  const list = await timed(`${ORIGIN}${sample['homes for sale']}?preview=${token}`);
  const nextLink = list.body.match(/href="(\/listings\/draft-only-home\/[^"]*)"/)?.[1]?.replaceAll('&amp;', '&');
  preview.inList = nextLink !== undefined;
  preview.clicked = nextLink ? await sees(nextLink) : { status: 0, fresh: false };
  preview.refused = [await sees(`${sample.listing}?preview=${expired}`), await sees(`${sample.listing}?preview=${forged}`), await sees(`${newPage}?preview=nonsense`)];
  preview.publicAfter = [await sees(sample.listing), await sees(newPage), await sees(sample['homes for sale'])];
  preview.inSearch = (await find('unpublished')).total;
  const stranger = await fetch(`${ORIGIN}/api/cms/published`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' });
  const hidden = (answers) => answers.every((answer) => !answer.edit && !answer.fresh);

  // 6. Speed again with 500 listing entries.
  server.kill();
  await seed(500);
  server = await startServer();
  const large = await measure();
  const largeIndex = (await revalidate('all')).search;
  const lookups = [];
  for (const query of ['lakeshore', 'three bed', 'pergola', 'maya', 'dallas hou']) {
    for (let i = 0; i < 5; i++) lookups.push((await timed(`${ORIGIN}/api/cms/search.json?q=${encodeURIComponent(query)}&lang=en-US`)).ms);
  }
  const spanish = await find('habitaciones', 'es-ES');
  const inEnglish = await find('habitaciones', 'en-US');

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
  console.log(`Search, live site: ${firstIndex.pages} pages indexed in ${(firstIndex.ms / 1000).toFixed(1)} s after start; ${largeIndex.pages} pages in ${(largeIndex.ms / 1000).toFixed(1)} s with 500 listings. That runs once per deploy.`);
  console.log(`After a street name change: search updated in ${ms(reindex.ms)} (${reindex.pages} page read again). Matches before: ${wordBefore}, after: ${wordAfter.total} (${wordAfter.hits[0]?.url}). Share image redrawn: ${cardChanged ? 'yes' : 'no'}.`);
  console.log(`In a browser, the unchanged search page shows: "${inBrowser.status}" First result: "${inBrowser.first}". Highlighted words: ${inBrowser.marked}. Errors: ${inBrowser.problems.length}.`);
  for (const line of inBrowser.problems.slice(0, 5)) console.log(`  - ${line}`);
  console.log(`A search answers in ${ms(median(lookups))} with 562 pages (median of ${lookups.length}). "habitaciones" finds ${spanish.total} Spanish pages and ${inEnglish.total} English ones.`);
  console.log(`\nDrafts. A published listing got a new price and a new listing was created, both saved and not published.`);
  console.log(`  Visitors before any preview: draft hidden on all three pages: ${hidden(preview.publicBefore) ? 'yes' : 'NO'}; new listing page answers ${preview.publicBefore[1].status}.`);
  console.log(`  Preview link: new price shown: ${preview.byLink.edit ? 'yes' : 'NO'}; headers: ${preview.byLink.headers.get('cache-control')}, ${preview.byLink.headers.get('x-robots-tag')}, ${preview.byLink.headers.get('x-astro-cache') ?? 'not from the cache'}.`);
  console.log(`  The list of homes in the preview shows the new listing: ${preview.inList ? 'yes' : 'NO'}; following its link answers ${preview.clicked.status} and shows it: ${preview.clicked.fresh ? 'yes' : 'NO'}.`);
  console.log(`  Expired, forged and nonsense tokens: draft hidden: ${hidden(preview.refused) ? 'yes' : 'NO'} (${preview.refused.map((answer) => answer.status).join(', ')}).`);
  console.log(`  Visitors after the previews: draft hidden: ${hidden(preview.publicAfter) ? 'yes' : 'NO'}; new listing page answers ${preview.publicAfter[1].status}; in search: ${preview.inSearch}.`);
  console.log(`  A publish notice without the site's secret answers ${stranger.status}.`);
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
