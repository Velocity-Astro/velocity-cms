#!/usr/bin/env node
/**
 * Gives every package that is published the same version. They are released together, so one
 * number says which CMS a site has.
 *
 *   node scripts/version.mjs 0.1.0-beta.2
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [version] = process.argv.slice(2);
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: node scripts/version.mjs <version>, such as 0.1.0-beta.2');
  process.exit(1);
}
const packages = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages');
for (const name of fs.readdirSync(packages).sort()) {
  const file = path.join(packages, name, 'package.json');
  if (!fs.existsSync(file)) continue;
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (manifest.private) continue;
  manifest.version = version;
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${manifest.name} ${version}`);
}
