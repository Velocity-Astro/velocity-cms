import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ContentTypeDef } from '@velocity-astro/cms-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installAgentFiles } from './agent-files.js';
import { blockMapKeys, checkSite, formatCheck } from './check.js';

let dir: string;
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};
const remove = (file: string) => fs.rmSync(path.join(dir, file), { recursive: true });
const CONFIG = `import { defineConfig, memoryCache } from 'astro/config';
import node from '@astrojs/node';
import velocityCms from '@velocity-astro/cms-astro';

export default defineConfig({
  site: 'https://lakeshore.example',
  adapter: node({ mode: 'standalone' }),
  experimental: { cache: { provider: memoryCache() }, routeRules: { '/[...path]': { maxAge: 86400, tags: ['cms'] } } },
  integrations: [velocityCms()],
});
`;

/** Content types as the database holds them: a page with two blocks, one of which offers a form. */
const TYPES = [
  {
    id: 't1',
    key: 'pages',
    fields: [
      {
        id: 'f1',
        key: 'sections',
        type: 'blocks',
        options: {
          blocks: [
            { id: 'b1', key: 'hero', fields: [{ id: 'f2', key: 'title', type: 'text', options: {} }] },
            { id: 'b2', key: 'contact', fields: [{ id: 'f3', key: 'form', type: 'form', options: {} }] },
            { id: 'b3', key: 'old', retiredAt: '2026-01-01', fields: [] },
          ],
        },
      },
    ],
  },
] as unknown as ContentTypeDef[];

/** A site that follows every rule. Each test breaks one. */
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-cms-check-'));
  write('astro.config.mjs', CONFIG);
  write('.env', 'VELOCITY_CMS_SECRET=s\n');
  write('.gitignore', '.env\n');
  write('src/layouts/Layout.astro', "---\nimport { pageHead, single } from '@velocity-astro/cms-astro';\nconst head = await pageHead(Astro, {});\nconst settings = await single(Astro, 'settings');\n---\n<slot />\n");
  write('src/pages/[...slug].astro', "---\nimport { entryPage } from '@velocity-astro/cms-astro';\nimport Layout from '../layouts/Layout.astro';\nexport const prerender = false;\nconst page = await entryPage(Astro, { types: ['pages'] });\n---\n<Layout />\n");
  write('src/components/blocks.ts', "import Hero from './Hero.astro';\nimport Contact from './Contact.astro';\nexport const blocks = { hero: Hero, contact: Contact };\n");
  write('src/components/Hero.astro', '<h1>Hi</h1>\n');
  write('src/components/Contact.astro', "---\nimport { siteForm } from '@velocity-astro/cms-astro';\nconst form = await siteForm(Astro, { id: Astro.props.form });\n---\n<form />\n");
  installAgentFiles(dir, () => undefined);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const rules = () => checkSite({ dir, types: TYPES }).findings.map((finding) => finding.rule);

describe('velocity-cms check', () => {
  it('finds nothing wrong with a site that follows the rules', () => {
    expect(checkSite({ dir, types: TYPES }).findings).toEqual([]);
    expect(formatCheck(checkSite({ dir, types: TYPES }))).toBe('velocity-cms check: no problems found.');
  });

  it('names the file, the rule in cms.md and the fix for each finding', () => {
    write('src/pages/about.astro', "---\nimport Layout from '../layouts/Layout.astro';\n---\n<Layout />\n");
    const [finding] = checkSite({ dir, types: TYPES }).findings;
    expect(finding).toMatchObject({ rule: 'prerendered-cms-page', level: 'error', file: 'src/pages/about.astro', see: 'Live pages' });
    expect(finding?.message).toContain('through src/layouts/Layout.astro');
    expect(formatCheck(checkSite({ dir, types: TYPES }))).toContain('Fix: Add `export const prerender = false;` to the page.');
  });

  it('refuses a folder with no Astro site', () => {
    remove('astro.config.mjs');
    expect(rules()).toEqual(['no-astro-site']);
  });

  it.each([
    ['no-integration', CONFIG.replace("import velocityCms from '@velocity-astro/cms-astro';\n", '').replace('velocityCms()', '')],
    ['no-adapter', CONFIG.replace("  adapter: node({ mode: 'standalone' }),\n", '')],
    ['no-site-address', CONFIG.replace("  site: 'https://lakeshore.example',\n", '')],
    ['output-server', CONFIG.replace('export default defineConfig({', "export default defineConfig({\n  output: 'server',")],
    ['no-cms-cache-tag', CONFIG.replace("tags: ['cms']", 'tags: []')],
  ])('finds %s in the config', (rule, config) => {
    write('astro.config.mjs', config);
    expect(rules()).toContain(rule);
  });

  it('finds a secret that is missing, or not kept out of git', () => {
    write('.env', 'OTHER=1\n');
    expect(rules()).toContain('no-secret');
    expect(checkSite({ dir, types: TYPES, env: { VELOCITY_CMS_SECRET: 'set' } }).findings.map((finding) => finding.rule)).not.toContain('no-secret');
    write('.env', 'VELOCITY_CMS_SECRET=s\n');
    write('.gitignore', 'node_modules\n');
    expect(rules()).toEqual(['env-in-git']);
  });

  it('finds a page that reads the CMS and is built ahead of time', () => {
    write('src/pages/[...slug].astro', "---\nimport { entryPage } from '@velocity-astro/cms-astro';\nexport const prerender = true;\nconst page = await entryPage(Astro, { types: ['pages'] });\n---\n");
    expect(rules()).toEqual(['prerendered-cms-page']);
  });

  it('finds pages drawn from entries with no pageHead', () => {
    write('src/layouts/Layout.astro', '<slot />\n');
    expect(rules()).toEqual(['no-page-head']);
  });

  it('finds a file that reads the CMS around the helpers', () => {
    write('src/lib/posts.ts', "import { sharedConnection } from '@velocity-astro/cms-astro';\nexport const all = async () => (await sharedConnection()).cms.content.find({});\n");
    expect(rules()).toEqual(['reads-around-helpers']);
  });

  it('finds blocks with no component, a map that is missing and components with no block', () => {
    write('src/components/blocks.ts', "import Hero from './Hero.astro';\nimport Gallery from './Gallery.astro';\nexport const blocks = { hero: Hero, gallery: Gallery };\n");
    expect(rules()).toEqual(['block-without-component', 'component-without-block']);
    remove('src/components/blocks.ts');
    expect(rules()).toEqual(['no-block-map']);
  });

  it('finds a section that offers a form and never draws one', () => {
    write('src/components/Contact.astro', '<form />\n');
    expect(rules()).toEqual(['form-section-without-form']);
  });

  it('leaves out what it cannot compare without the model, and says so', () => {
    remove('src/components/blocks.ts');
    const result = checkSite({ dir, typesSkipped: 'the database has not been made yet' });
    expect(result.findings).toEqual([]);
    expect(formatCheck(result)).toContain('Not checked: Blocks and forms were not compared with the model: the database has not been made yet.');
  });

  it('finds agent rules that are missing or from another version', () => {
    write('.agents/cms.md', '<!-- velocity-cms 0.0.1 -->\n');
    expect(rules()).toEqual(['old-agent-rules']);
    remove('.agents');
    expect(rules()).toEqual(['no-agent-rules']);
  });

  it('reads a map of blocks however its keys are written', () => {
    expect([...(blockMapKeys("export const blocks: Record<string, unknown> = {\n  hero: Hero,\n  'call-to-action': Cta,\n  \"faq\": Faq,\n};") ?? [])]).toEqual([['hero', 'Hero'], ['call-to-action', 'Cta'], ['faq', 'Faq']]);
    expect(blockMapKeys('const other = {}')).toBeNull();
  });
});
