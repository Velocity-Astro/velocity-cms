import fs from 'node:fs';
import path from 'node:path';

/** The package a site installs. Its own `velocity-cms` command does the work once it is there. */
export const PACKAGE = '@velocity-astro/cms-astro';

/** The folder of the CMS as this site has it installed, looking up from `dir`, or `null`. */
export function installed(dir) {
  for (let at = path.resolve(dir); ; at = path.dirname(at)) {
    const found = path.join(at, 'node_modules', ...PACKAGE.split('/'));
    if (fs.existsSync(path.join(found, 'package.json'))) return found;
    if (path.dirname(at) === at) return null;
  }
}

/** The command that adds a package to this site, by the lockfile the site keeps. npm when it keeps none. */
export function addCommand(dir, spec) {
  const has = (file) => fs.existsSync(path.join(dir, file));
  if (has('pnpm-lock.yaml')) return ['pnpm', ['add', spec]];
  if (has('yarn.lock')) return ['yarn', ['add', spec]];
  if (has('bun.lock') || has('bun.lockb')) return ['bun', ['add', spec]];
  return ['npm', ['install', spec]];
}
