import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PACKAGE, addCommand, installed } from './install.mjs';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-cms-command-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('the velocity-cms command', () => {
  it('finds no CMS in a site that has none', () => {
    expect(installed(dir)).toBeNull();
  });

  it('finds the CMS a site installed, from a folder inside the site', () => {
    const home = path.join(dir, 'node_modules', ...PACKAGE.split('/'));
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'package.json'), '{}');
    fs.mkdirSync(path.join(dir, 'src'));
    expect(installed(path.join(dir, 'src'))).toBe(home);
  });

  it('installs with the package manager the site keeps a lockfile for', () => {
    expect(addCommand(dir, 'x@1')).toEqual(['npm', ['install', 'x@1']]);
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
    expect(addCommand(dir, 'x@1')).toEqual(['pnpm', ['add', 'x@1']]);
    fs.rmSync(path.join(dir, 'pnpm-lock.yaml'));
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
    expect(addCommand(dir, 'x@1')).toEqual(['yarn', ['add', 'x@1']]);
    fs.rmSync(path.join(dir, 'yarn.lock'));
    fs.writeFileSync(path.join(dir, 'bun.lock'), '');
    expect(addCommand(dir, 'x@1')).toEqual(['bun', ['add', 'x@1']]);
  });
});
