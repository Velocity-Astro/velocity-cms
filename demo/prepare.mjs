#!/usr/bin/env node
/**
 * Turns an assembled real estate template into the CMS demo: its content is imported into the
 * CMS database, its pages are converted to live pages, and the CMS packages are installed from
 * this checkout as real copies, since a host bundles only what is inside the project.
 *
 *   node demo/prepare.mjs <assembled real-estate project>
 *
 * Reads VELOCITY_CMS_DATABASE_URL and VELOCITY_CMS_DATABASE_TOKEN. Content is imported only
 * into an empty database, so a deploy never overwrites what was edited on the demo.
 *
 * Rough on purpose, like the prototypes it reuses. A site made by the installer will not need it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from '../packages/cms-astro/dist/connection.js';
import { convert } from '../prototypes/live-site/convert.mjs';
import { importCollection } from '../prototypes/publish-speed/lib.mjs';

const [projectArg] = process.argv.slice(2);
if (!projectArg) throw new Error('Usage: prepare.mjs <assembled real-estate project>');
const project = path.resolve(projectArg);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (relative) => path.join(project, relative);
const PACKAGES = ['cms-core', 'cms-db', 'cms-api', 'cms-auth', 'cms-ui', 'cms-admin', 'cms-astro'];
const COLLECTIONS = ['listings', 'agents', 'neighborhoods', 'reviews'];

// 1. Content, before the conversion moves it.
const connection = await connect({});
try {
  if ((await connection.cms.schema.list()).length > 0) {
    console.log('The database already has content types: nothing imported.');
  } else {
    for (const name of COLLECTIONS) {
      const records = JSON.parse(fs.readFileSync(at(`src/content/estate/${name}.json`), 'utf8'));
      await importCollection(connection.cms, name, records);
      console.log(`Imported ${records.length} ${name}.`);
    }
  }
} finally {
  connection.close();
}

// 2. Live pages.
const changes = convert(project);
console.log(`Converted to live pages: ${JSON.stringify(changes)}`);

// 3. The CMS packages, packed as they would be published.
const packed = at('.cms-packages');
fs.rmSync(packed, { recursive: true, force: true });
fs.mkdirSync(packed);
const overrides = {};
for (const name of PACKAGES) {
  execFileSync('pnpm', ['pack', '--pack-destination', packed], { cwd: path.join(root, 'packages', name), stdio: 'ignore' });
  const file = fs.readdirSync(packed).find((entry) => entry.startsWith(`velocity-${name}-`));
  overrides[`@velocity/${name}`] = `file:./.cms-packages/${file}`;
}
const manifest = JSON.parse(fs.readFileSync(at('package.json'), 'utf8'));
manifest.dependencies = { ...manifest.dependencies, '@velocity/cms-astro': overrides['@velocity/cms-astro'] };
delete manifest.devDependencies?.['@velocity/cms-astro'];
manifest.pnpm = { ...manifest.pnpm, overrides: { ...manifest.pnpm?.overrides, ...overrides } };
fs.writeFileSync(at('package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
execFileSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: project, stdio: 'inherit' });
