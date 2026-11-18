#!/usr/bin/env node
/**
 * Sends every package to npm at the version in its package.json, as a staged publish: npm holds
 * each one until an owner approves it on npmjs.com (Staged Packages), and only then is it public.
 *
 *   node scripts/publish.mjs --tag beta [--dry-run]
 *
 * Each package is packed with pnpm first, which writes the real version over `workspace:*`, and
 * npm stages what was packed. A version already on npm is skipped, so a run that stopped halfway
 * can be run again. In a GitHub workflow npm signs in by itself (a trusted publisher); anywhere
 * else it uses whatever `npm login` or NODE_AUTH_TOKEN gives it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tag = args[args.indexOf('--tag') + 1];
if (!args.includes('--tag') || !tag || tag.startsWith('--')) {
  console.error('Usage: node scripts/publish.mjs --tag <tag> [--dry-run]');
  process.exit(1);
}

const packages = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-cms-release-'));

/** Whether npm already has this version. A staged one is not public yet and does not count. */
function onNpm(name, version) {
  try {
    return execFileSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === version;
  } catch {
    return false;
  }
}

let staged = 0;
for (const folder of fs.readdirSync(packages).sort()) {
  const file = path.join(packages, folder, 'package.json');
  if (!fs.existsSync(file)) continue;
  const { name, version, private: isPrivate } = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (isPrivate) continue;
  if (onNpm(name, version)) {
    console.log(`${name}@${version} is already on npm: skipped.`);
    continue;
  }
  const to = path.join(work, folder);
  fs.mkdirSync(to);
  execFileSync('pnpm', ['pack', '--pack-destination', to], { cwd: path.join(packages, folder), stdio: 'ignore' });
  const [tarball] = fs.readdirSync(to);
  execFileSync('tar', ['-xzf', path.join(to, tarball), '-C', to]);
  const packed = JSON.parse(fs.readFileSync(path.join(to, 'package', 'package.json'), 'utf8'));
  const unresolved = Object.entries({ ...packed.dependencies, ...packed.peerDependencies }).filter(([, range]) => String(range).startsWith('workspace:'));
  if (unresolved.length > 0) throw new Error(`${name} was packed with ${unresolved.map(([dependency]) => dependency).join(', ')} still pointing at the workspace.`);
  // What was packed is already built: its scripts must not run again from the unpacked copy.
  execFileSync('npm', ['stage', 'publish', '--tag', tag, '--access', 'public', '--ignore-scripts', ...(dryRun ? ['--dry-run'] : [])], { cwd: path.join(to, 'package'), stdio: 'inherit' });
  console.log(`${name}@${version} ${dryRun ? 'would be staged' : 'is staged'} under "${tag}".`);
  staged += 1;
}
console.log(dryRun ? `Rehearsed ${staged} package${staged === 1 ? '' : 's'}.` : `Staged ${staged} package${staged === 1 ? '' : 's'}. Approve them on npmjs.com, under Staged Packages.`);
