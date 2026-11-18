#!/usr/bin/env node
/**
 * Publish speed prototype.
 *
 *   node prototypes/publish-speed/bench.mjs <assembled real-estate project> [entries=500]
 *
 * Builds the real estate template several ways and prints how long each build takes:
 * the stock JSON loader against the CMS loader, at the template's own size and at `entries`.
 * See README.md here for what the numbers mean and the last recorded run.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importCollection, multiply, openCms, OWNER } from './lib.mjs';

const [projectArg, entriesArg = '500'] = process.argv.slice(2);
if (!projectArg) throw new Error('Usage: bench.mjs <assembled real-estate project> [entries]');
const project = path.resolve(projectArg);
const target = Number(entriesArg);
const here = path.dirname(fileURLToPath(import.meta.url));
const loaderPackage = path.resolve(here, '../../packages/cms-astro');

const collections = path.join(project, 'src/config/collections.ts');
const listingsJson = path.join(project, 'src/content/estate/listings.json');
const dbFile = path.join(project, 'cms/data.db');
const astroConfig = path.join(project, 'astro.config.mjs');
const original = {
  collections: fs.readFileSync(collections, 'utf8'),
  listings: fs.readFileSync(listingsJson, 'utf8'),
  astroConfig: fs.readFileSync(astroConfig, 'utf8'),
};
const records = JSON.parse(original.listings);

const FILE_LOADER = "loader: file('src/content/estate/listings.json'),";
const CMS_LOADER = "loader: cmsLoader({ type: 'listings' }),";
if (!original.collections.includes(FILE_LOADER)) throw new Error('The listings loader line was not found. Has the template changed?');

const INTEGRATIONS = '  integrations: [';
if (!original.astroConfig.includes(INTEGRATIONS)) throw new Error('The integrations list was not found in astro.config.mjs.');

function useCmsLoader() {
  fs.writeFileSync(
    astroConfig,
    `import velocityCms from '@velocity-astro/cms-astro';\n${original.astroConfig.replace(INTEGRATIONS, `${INTEGRATIONS}\n    velocityCms(),`)}`,
  );
  fs.writeFileSync(
    collections,
    original.collections
      .replace(FILE_LOADER, CMS_LOADER)
      .replace("import { file } from 'astro/loaders';", "import { file } from 'astro/loaders';\nimport { cmsLoader } from '@velocity-astro/cms-astro';"),
  );
}

async function seed(rows) {
  fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const { cms, close } = await openCms(`file:${dbFile}`);
  const started = performance.now();
  const type = await importCollection(cms, 'listings', rows);
  const seconds = (performance.now() - started) / 1000;
  close();
  return { type, seconds };
}

const clearCaches = () => {
  for (const dir of ['.astro', 'node_modules/.astro', 'dist']) fs.rmSync(path.join(project, dir), { recursive: true, force: true });
};

function build(labelText, { cold }) {
  if (cold) clearCaches();
  const started = performance.now();
  const output = execFileSync('pnpm', ['build'], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const seconds = (performance.now() - started) / 1000;
  const pages = fs.readdirSync(path.join(project, 'dist'), { recursive: true }).filter((file) => String(file).endsWith('.html')).length;
  const loader = output.match(/listings: (\d+) published, (\d+) changed/);
  const row = { build: labelText, seconds: seconds.toFixed(1), pages, loader: loader ? `${loader[1]} published, ${loader[2]} changed` : 'file loader' };
  console.log(row);
  return row;
}

const rows = [];
try {
  execFileSync('pnpm', ['add', '-D', `@velocity-astro/cms-astro@link:${loaderPackage}`], { cwd: project, stdio: 'ignore' });

  // 1. The template as it ships.
  rows.push(build(`JSON file, ${records.length} entries, cold`, { cold: true }));
  rows.push(build(`JSON file, ${records.length} entries, warm`, { cold: false }));

  // 2. The same content from the CMS.
  await seed(records);
  useCmsLoader();
  rows.push(build(`CMS, ${records.length} entries, cold`, { cold: true }));
  rows.push(build(`CMS, ${records.length} entries, warm`, { cold: false }));

  // 3. The JSON loader at the target size, to separate the loader's cost from the cost of more pages.
  const many = multiply(records, target);
  fs.writeFileSync(collections, original.collections);
  fs.writeFileSync(astroConfig, original.astroConfig);
  fs.writeFileSync(listingsJson, JSON.stringify(many));
  rows.push(build(`JSON file, ${many.length} entries, cold`, { cold: true }));
  rows.push(build(`JSON file, ${many.length} entries, warm`, { cold: false }));

  // 4. The CMS at the target size.
  const { type, seconds } = await seed(many);
  console.log(`Imported and published ${many.length} entries through the services in ${seconds.toFixed(1)}s`);
  useCmsLoader();
  rows.push(build(`CMS, ${many.length} entries, cold`, { cold: true }));
  rows.push(build(`CMS, ${many.length} entries, warm, nothing changed`, { cold: false }));

  // 5. What an owner does: change one listing and publish.
  const { cms, close } = await openCms(`file:${dbFile}`);
  const first = (await cms.content.find(OWNER, { typeId: type.id, limit: 1 })).items[0];
  const price = type.fields.find((field) => field.key === 'price');
  await cms.content.update(OWNER, first.id, { data: { ...first.data, [price.id]: first.data[price.id] + 1000 }, expectedRevision: first.revision });
  await cms.content.publish(OWNER, first.id);
  close();
  rows.push(build(`CMS, ${many.length} entries, warm, one listing edited`, { cold: false }));
} finally {
  fs.writeFileSync(collections, original.collections);
  fs.writeFileSync(astroConfig, original.astroConfig);
  fs.writeFileSync(listingsJson, original.listings);
}

console.log('\n| Build | Seconds | Pages | Loader |\n|---|---|---|---|');
for (const row of rows) console.log(`| ${row.build} | ${row.seconds} | ${row.pages} | ${row.loader} |`);
