import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from './cli.js';
import { connect } from './connection.js';
import { initSite, loadCmsEnv, readEnvFile, withIntegration } from './init.js';

let dir: string;
let printed: string[];
const print = (line: string) => printed.push(line);
const read = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8');
const write = (file: string, text: string) => fs.writeFileSync(path.join(dir, file), text);
const CONFIG = `import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://lakeshore.example',
  adapter: node({ mode: 'standalone' }),
  integrations: [],
});
`;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-cms-init-'));
  printed = [];
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('setting a site up', () => {
  it('adds a secret, keeps it out of git and adds the integration', () => {
    write('astro.config.mjs', CONFIG);
    const { code, env } = initSite({ dir, print, secret: () => 's'.repeat(43) });
    expect(code).toBe(0);
    expect(readEnvFile(read('.env'))).toEqual({ VELOCITY_CMS_SECRET: 's'.repeat(43), VELOCITY_CMS_ORIGIN: 'http://localhost:4321' });
    expect(env['VELOCITY_CMS_SECRET']).toBe('s'.repeat(43));
    expect(read('.gitignore').split('\n')).toEqual(expect.arrayContaining(['.env', '/cms/']));
    expect(read('astro.config.mjs')).toContain("import node from '@astrojs/node';\nimport velocityCms from '@velocity-astro/cms-astro';");
    expect(read('astro.config.mjs')).toContain('integrations: [velocityCms()],');
    expect(printed.join('\n')).not.toMatch(/no adapter|no `site`/);
  });

  it('makes a long secret of its own, and a different one each time', () => {
    write('astro.config.mjs', CONFIG);
    const first = initSite({ dir, print }).env['VELOCITY_CMS_SECRET'] ?? '';
    fs.rmSync(path.join(dir, '.env'));
    const second = initSite({ dir, print }).env['VELOCITY_CMS_SECRET'] ?? '';
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(second).not.toBe(first);
  });

  it('changes nothing that is there when it is run again', () => {
    write('astro.config.mjs', CONFIG);
    write('.env', 'RESEND_API_KEY="abc"\nVELOCITY_CMS_SECRET=kept-as-it-is-kept-as-it-is-kept-as-it-is');
    write('.gitignore', 'node_modules\n.env\n');
    initSite({ dir, print });
    const [env, ignore, config] = [read('.env'), read('.gitignore'), read('astro.config.mjs')];
    expect(readEnvFile(env)).toMatchObject({ RESEND_API_KEY: 'abc', VELOCITY_CMS_SECRET: 'kept-as-it-is-kept-as-it-is-kept-as-it-is' });
    expect(ignore).toBe('node_modules\n.env\n/cms/\n');
    initSite({ dir, print });
    expect([read('.env'), read('.gitignore'), read('astro.config.mjs')]).toEqual([env, ignore, config]);
    expect(printed.join('\n')).toContain('already has the CMS');
  });

  it('says what is still to do: an adapter, the site address, a config it cannot edit', () => {
    write('astro.config.ts', "import { defineConfig } from 'astro/config';\nconst integrations = makeThem();\nexport default defineConfig({ integrations });\n");
    expect(initSite({ dir, print }).code).toBe(0);
    const output = printed.join('\n');
    expect(output).toContain('add these two lines yourself');
    expect(output).toContain('has no adapter yet');
    expect(output).toContain('has no `site` yet');
    expect(read('astro.config.ts')).not.toContain('velocityCms');
  });

  it('refuses a folder that is not an Astro site, and writes nothing', () => {
    expect(initSite({ dir, print }).code).toBe(1);
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(printed.join('\n')).toContain("Run this in the site's own folder");
  });

  it('sets a list written over several lines in as its neighbours are', () => {
    const next = withIntegration("import a from 'a';\nexport default {\n  integrations: [\n    a(),\n    b(),\n  ],\n};\n");
    expect(next).toContain('  integrations: [\n    velocityCms(),\n    a(),\n    b(),\n  ],');
    expect(withIntegration('export default { integrations: [a()] };')).toBe("import velocityCms from '@velocity-astro/cms-astro';\n\nexport default { integrations: [velocityCms(), a()] };");
    expect(withIntegration('export default { integrations: [a()], other: { integrations: [] } };')).toBeNull();
  });
});

describe('the init command', () => {
  it('sets the site up and makes the first owner in one go', async () => {
    write('astro.config.mjs', CONFIG);
    const code = await runCli(['init', 'dana@example.com', 'Dana', 'Whitfield'], { env: { VELOCITY_CMS_DATABASE_URL: ':memory:' }, print, dir });
    const output = printed.join('\n');
    expect(code).toBe(0);
    expect(output).toContain('Dana Whitfield <dana@example.com>');
    expect(output).toContain('http://localhost:4321/api/cms/auth/magic-link/verify?token=');
    expect(output).toContain('Start the site first');
    // The secret is in the file, never on the screen.
    expect(output).not.toContain(readEnvFile(read('.env'))['VELOCITY_CMS_SECRET']);
  });

  it('says what comes next when no owner is named, and asks for a name with an address', async () => {
    write('astro.config.mjs', CONFIG);
    expect(await runCli(['init'], { env: {}, print, dir })).toBe(0);
    expect(printed.join('\n')).toContain('npx velocity-cms owner <email> <name>');
    expect(await runCli(['init', 'dana@example.com'], { env: {}, print, dir })).toBe(1);
  });
});

describe('a database that is a file', () => {
  it('is made with its folder the first time it is opened', async () => {
    const file = path.join(dir, 'cms', 'data.db');
    const connection = await connect({ url: `file:${file}` });
    connection.close();
    expect(fs.existsSync(file)).toBe(true);
  });
});

describe('the settings a site keeps in .env', () => {
  it('reach the environment, the more specific file first, and never replace what is set', () => {
    write('.env', 'VELOCITY_CMS_SECRET=from-env\nVELOCITY_CMS_ORIGIN=http://localhost:4321\nOTHER=left-alone\n');
    write('.env.development', 'VELOCITY_CMS_ORIGIN=http://localhost:5000\n');
    const env: Record<string, string | undefined> = { VELOCITY_CMS_DATABASE_URL: 'file:set.db' };
    loadCmsEnv(dir, 'development', env);
    expect(env).toEqual({ VELOCITY_CMS_DATABASE_URL: 'file:set.db', VELOCITY_CMS_SECRET: 'from-env', VELOCITY_CMS_ORIGIN: 'http://localhost:5000' });
  });
});
