#!/usr/bin/env node
/**
 * Installs the CMS packages of this checkout (built first, `pnpm build`) into a site, packed as
 * they would be published, in place of the version the site names from npm. A host bundles only
 * what is inside the project, so each package is packed into the site's own folder. For trying a
 * site against what is not released yet, as the Marketing site workflow's preview does.
 *
 *   node .github/scripts/use-cms-checkout.mjs <site folder>
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [siteArg] = process.argv.slice(2);
if (!siteArg) throw new Error('Usage: use-cms-checkout.mjs <site folder>');
const site = path.resolve(siteArg);
const packages = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages');
const PACKAGES = ['cms-core', 'cms-db', 'cms-api', 'cms-auth', 'cms-ui', 'cms-admin', 'cms-plugins', 'cms-astro'];

const packed = path.join(site, '.cms-packages');
fs.rmSync(packed, { recursive: true, force: true });
fs.mkdirSync(packed);
const files = {};
for (const name of PACKAGES) {
  const before = new Set(fs.readdirSync(packed));
  execFileSync('pnpm', ['pack', '--pack-destination', packed], { cwd: path.join(packages, name), stdio: 'ignore' });
  const file = fs.readdirSync(packed).find((entry) => !before.has(entry));
  const scope = JSON.parse(fs.readFileSync(path.join(packages, name, 'package.json'), 'utf8')).name;
  files[scope] = `file:./.cms-packages/${file}`;
}

const manifestFile = path.join(site, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
for (const field of ['dependencies', 'devDependencies']) {
  for (const name of Object.keys(manifest[field] ?? {})) if (files[name]) manifest[field][name] = files[name];
}
manifest.pnpm = { ...manifest.pnpm, overrides: { ...manifest.pnpm?.overrides, ...files } };
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
execFileSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: site, stdio: 'inherit' });
console.log(`Installed the CMS from this checkout into ${site}.`);
