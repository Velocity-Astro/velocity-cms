#!/usr/bin/env node
/**
 * `npx velocity-cms <command>` in a site that may not have the CMS yet. `init` installs it with
 * the site's own package manager; every command is then handed to the CMS the site has, so the
 * command and the site's code are always the same version.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE, addCommand, installed } from './install.mjs';

const dir = process.cwd();
const args = process.argv.slice(2);
const windows = process.platform === 'win32';

let cms = installed(dir);
if (!cms && args[0] === 'init') {
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    console.error('There is no package.json here. Run this in the folder of your Astro site.');
    process.exit(1);
  }
  const { version } = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
  const [command, parts] = addCommand(dir, `${PACKAGE}@${version}`);
  console.log(`Installing ${PACKAGE} with ${command}.\n`);
  const done = spawnSync(command, parts, { cwd: dir, stdio: 'inherit', shell: windows });
  if (done.status !== 0) {
    console.error(`\n${PACKAGE} could not be installed. Install it yourself, then run this again.`);
    process.exit(done.status ?? 1);
  }
  cms = installed(dir);
}
if (!cms) {
  console.error(`This site does not have Velocity CMS yet. To add it:\n\n  npx velocity-cms init\n`);
  process.exit(args.length === 0 || args[0] === 'help' ? 0 : 1);
}
const run = spawnSync(process.execPath, [path.join(cms, 'bin', 'velocity-cms.mjs'), ...args], { cwd: dir, stdio: 'inherit' });
process.exit(run.status ?? 1);
