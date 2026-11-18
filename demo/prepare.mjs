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
import { OWNER, importRecords, toStored } from '../prototypes/publish-speed/lib.mjs';
import { importedTypes, realEstateModel, sampleMenus, samplePages } from './real-estate-model.mjs';

const [projectArg] = process.argv.slice(2);
if (!projectArg) throw new Error('Usage: prepare.mjs <assembled real-estate project>');
const project = path.resolve(projectArg);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (relative) => path.join(project, relative);
const PACKAGES = ['cms-core', 'cms-db', 'cms-api', 'cms-auth', 'cms-ui', 'cms-admin', 'cms-plugins', 'cms-astro'];

// 1. Content types and content, before the conversion moves the files.
const connection = await connect({});
try {
  const isNew = (await connection.cms.schema.list()).length === 0;
  // Every deploy: the types are made to match the template's description. Field ids are kept,
  // so what was edited on the demo stays.
  const types = new Map();
  for (const model of realEstateModel) types.set(model.key, await connection.cms.schema.define(OWNER, model));
  console.log(`Content types match the template: ${[...types.keys()].join(', ')}.`);
  if (!isNew) {
    console.log('The database already has content: nothing imported.');
  } else {
    for (const name of importedTypes) {
      const type = types.get(name);
      const records = JSON.parse(fs.readFileSync(at(`src/content/estate/${name}.json`), 'utf8'));
      await importRecords(connection.cms, type, records);
      console.log(`Imported ${records.length} ${name}.`);
    }
  }
  // Pages built in the editor have no file to come from. A site with none gets one to open.
  const pages = types.get('pages');
  if ((await connection.cms.content.find(OWNER, { typeId: pages.id, limit: 1 })).total === 0) {
    await importRecords(connection.cms, pages, samplePages);
    console.log(`Added ${samplePages.length} sample page${samplePages.length === 1 ? '' : 's'}.`);
  }
  // The menus are an entry too. A site with none gets the template's own links to edit.
  const navigation = types.get('navigation');
  if ((await connection.cms.content.find(OWNER, { typeId: navigation.id, limit: 1 })).total === 0) {
    const made = (await connection.cms.content.find(OWNER, { typeId: pages.id, limit: 500 })).items;
    const links = (items) =>
      items.flatMap(({ label, href, page }) => {
        const entry = made.find((candidate) => candidate.locale === 'en' && candidate.slug === page);
        if (href) return [{ label, link: { kind: 'address', href } }];
        return entry ? [{ label, link: { kind: 'entry', type: 'pages', entry: entry.translationGroup } }] : [];
      });
    const menus = { header: links(sampleMenus.header), footer: links(sampleMenus.footer) };
    const draft = await connection.cms.content.create(OWNER, { typeId: navigation.id, locale: 'en', slug: 'navigation', data: toStored(navigation.fields, menus) });
    await connection.cms.content.publish(OWNER, draft.id);
    console.log('Added the header and footer menus.');
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
