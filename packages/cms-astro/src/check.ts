import fs from 'node:fs';
import path from 'node:path';
import { liveFields, type BlockDef, type ContentTypeDef } from '@velocity-astro/cms-core';
import { AGENT_FILES_VERSION, CMS_RULES_FILE } from './agent-files.js';
import { readEnvFile } from './init.js';

/**
 * `velocity-cms check`: inspects a site on the CMS and names each problem with its file, the
 * rule in `.agents/cms.md` it breaks and the fix, so an agent (or a person) can prove its work
 * before saying it is done. It reads the site's files and, where it can, the content types in
 * its database; it changes nothing.
 */

export type FindingLevel = 'error' | 'warning';

export interface Finding {
  /** A short name for the rule, such as `prerendered-cms-page`. */
  readonly rule: string;
  readonly level: FindingLevel;
  /** The file it is about, from the site's folder. */
  readonly file: string;
  readonly message: string;
  /** The heading in `.agents/cms.md` the rule is written under. */
  readonly see: string;
  readonly fix: string;
}

export interface CheckResult {
  readonly findings: readonly Finding[];
  /** What the check could not look at, and why: a database it could not read, say. */
  readonly skipped: readonly string[];
}

export interface CheckOptions {
  readonly dir: string;
  /** The content types, as the site's database holds them. Left out, the rules that need them are skipped. */
  readonly types?: readonly ContentTypeDef[];
  /** Why there are no types, when there are none. */
  readonly typesSkipped?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

const CONFIG_FILES = ['astro.config.mjs', 'astro.config.ts', 'astro.config.js', 'astro.config.mts'];
const SOURCE = /\.(astro|ts|tsx|js|jsx|mjs|mts)$/;
/** What a template calls to read the CMS for a page. A file that calls one draws CMS content. */
const READERS = /\b(entryPage|single|menuLinks|linkTo|siteForm|pageHead|getLiveCollection|getLiveEntry)\s*\(/;
const PACKAGE = '@velocity-astro/cms-astro';

/** Every source file under a folder, from the site's folder, skipping what is built or installed. */
function filesUnder(dir: string, folder: string): string[] {
  const root = path.join(dir, folder);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((name) => SOURCE.test(name) && !/(^|[\\/])(node_modules|dist|\.astro)[\\/]/.test(name))
    .map((name) => path.join(folder, name).split(path.sep).join('/'));
}

/** The files a file imports by path, resolved from the site's folder (`@/` is `src/`). Packages are left out. */
function importsOf(dir: string, file: string, text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/(?:import|from)\s*['"]([^'"]+)['"]/g)) {
    const spec = match[1] ?? '';
    const base = spec.startsWith('@/') ? path.join('src', spec.slice(2)) : spec.startsWith('.') ? path.join(path.dirname(file), spec) : null;
    if (base === null) continue;
    for (const candidate of [base, `${base}.ts`, `${base}.astro`, `${base}.js`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(path.join(dir, candidate)) && fs.statSync(path.join(dir, candidate)).isFile()) {
        found.push(candidate.split(path.sep).join('/'));
        break;
      }
    }
  }
  return found;
}

/** A page's own setting: `true` for `prerender = true`, `false` for `prerender = false`, `null` when it says nothing. */
function prerenderOf(text: string): boolean | null {
  const match = /export\s+const\s+prerender\s*=\s*(true|false)/.exec(text);
  return match ? match[1] === 'true' : null;
}

/** The keys of an object literal that maps blocks to components: `export const blocks = { hero: Hero, 'call-to-action': Cta }`. */
export function blockMapKeys(text: string): Map<string, string> | null {
  const start = /export\s+const\s+blocks\b[^=]*=\s*\{/.exec(text);
  if (!start) return null;
  let depth = 1;
  let at = start.index + start[0].length;
  const begin = at;
  while (at < text.length && depth > 0) {
    if (text[at] === '{') depth += 1;
    if (text[at] === '}') depth -= 1;
    at += 1;
  }
  const body = text.slice(begin, at - 1);
  const map = new Map<string, string>();
  for (const match of body.matchAll(/(?:^|[,{\s])(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*([A-Za-z_$][\w$]*)/g)) {
    map.set(match[1] ?? match[2] ?? match[3] ?? '', match[4] ?? '');
  }
  return map;
}

/** The blocks a site's pages can be built from today: those of every top-level field of sections. */
function siteBlocks(types: readonly ContentTypeDef[]): Map<string, BlockDef> {
  const blocks = new Map<string, BlockDef>();
  for (const type of types) {
    for (const field of liveFields(type.fields)) {
      const allowed = (field.options as { blocks?: unknown }).blocks;
      if (!Array.isArray(allowed)) continue;
      for (const block of allowed as BlockDef[]) if (block.retiredAt === undefined) blocks.set(block.key, block);
    }
  }
  return blocks;
}

export function checkSite({ dir, types, typesSkipped, env = {} }: CheckOptions): CheckResult {
  const findings: Finding[] = [];
  const skipped: string[] = [];
  const add = (finding: Finding) => findings.push(finding);
  const read = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8');

  // 1. Setup: the integration, an adapter, an address, a secret kept out of git.
  const configFile = CONFIG_FILES.find((file) => fs.existsSync(path.join(dir, file)));
  const config = configFile ? read(configFile) : '';
  if (!configFile) {
    add({ rule: 'no-astro-site', level: 'error', file: '.', message: 'There is no Astro config here.', see: 'Setup', fix: 'Run the check in the site\'s own folder.' });
    return { findings, skipped };
  }
  if (!config.includes(PACKAGE)) add({ rule: 'no-integration', level: 'error', file: configFile, message: 'The CMS is not in the Astro config.', see: 'Setup', fix: 'Run `npx velocity-cms init`, or add `velocityCms()` to `integrations`.' });
  if (!/\badapter\s*:/.test(config)) add({ rule: 'no-adapter', level: 'error', file: configFile, message: 'The site has no server adapter, and the editor and live pages run on a server.', see: 'Setup', fix: 'Add one for where the site will live, such as `npx astro add node`.' });
  if (!/\bsite\s*:/.test(config)) add({ rule: 'no-site-address', level: 'warning', file: configFile, message: 'The config has no `site`, so sign-in links have no address to lead to once deployed.', see: 'Setup', fix: 'Set `site` to the site\'s address (or `VELOCITY_CMS_ORIGIN` on the host).' });
  if (/\boutput\s*:\s*['"]server['"]/.test(config)) add({ rule: 'output-server', level: 'warning', file: configFile, message: 'The whole site renders on demand (`output: \'server\'`).', see: 'Live pages', fix: 'Remove it, and mark only the pages that read the CMS with `export const prerender = false`.' });
  if (!/tags\s*:\s*\[[^\]]*['"]cms['"]/.test(config)) {
    add({ rule: 'no-cms-cache-tag', level: 'warning', file: configFile, message: 'No route rule tags pages with `cms`, so a page that reads the CMS through a layout may be kept after a publish.', see: 'Live pages', fix: 'Add `routeRules: { \'/[...path]\': { maxAge: 86400, tags: [\'cms\'] } }` and a `cache` provider, as the starter does.' });
  }
  const dotEnv = fs.existsSync(path.join(dir, '.env')) ? readEnvFile(read('.env')) : {};
  if (!env['VELOCITY_CMS_SECRET'] && !dotEnv['VELOCITY_CMS_SECRET']) add({ rule: 'no-secret', level: 'error', file: '.env', message: 'VELOCITY_CMS_SECRET is not set.', see: 'Setup', fix: 'Run `npx velocity-cms init`, which writes one. Set the same name on your host.' });
  const ignored = fs.existsSync(path.join(dir, '.gitignore')) ? read('.gitignore').split(/\r?\n/).map((line) => line.trim().replace(/^\//, '')) : [];
  if (fs.existsSync(path.join(dir, '.env')) && !ignored.some((line) => line === '.env' || line === '.env*')) {
    add({ rule: 'env-in-git', level: 'error', file: '.gitignore', message: '.env is not left out of git, and it holds the site\'s secret and tokens.', see: 'Setup', fix: 'Add `.env` to .gitignore (`npx velocity-cms init` does).' });
  }

  // 2. Pages that read the CMS must be drawn on demand, or a publish never reaches them.
  const sources = filesUnder(dir, 'src');
  const texts = new Map(sources.map((file) => [file, read(file)]));
  const readsCms = new Set(sources.filter((file) => READERS.test(texts.get(file) ?? '') && ((texts.get(file) ?? '').includes(PACKAGE) || (texts.get(file) ?? '').includes('astro:content'))));
  const pages = sources.filter((file) => file.startsWith('src/pages/') && /\.(astro|ts|js|mjs)$/.test(file));
  const prerenderedByDefault = !/\boutput\s*:\s*['"]server['"]/.test(config);
  for (const page of pages) {
    const text = texts.get(page) ?? '';
    const through = readsCms.has(page) ? page : importsOf(dir, page, text).find((file) => readsCms.has(file));
    if (!through) continue;
    const prerender = prerenderOf(text);
    if (prerender === true || (prerender === null && prerenderedByDefault)) {
      add({
        rule: 'prerendered-cms-page',
        level: 'error',
        file: page,
        message: through === page ? 'This page reads the CMS but is built ahead of time, so a publish never reaches it.' : `This page reads the CMS through ${through} but is built ahead of time, so a publish never reaches it.`,
        see: 'Live pages',
        fix: 'Add `export const prerender = false;` to the page.',
      });
    }
  }
  const drawsEntries = sources.some((file) => /\b(entryPage|getLiveEntry|getLiveCollection)\s*\(/.test(texts.get(file) ?? ''));
  if (drawsEntries && !sources.some((file) => /\bpageHead\s*\(/.test(texts.get(file) ?? ''))) {
    add({ rule: 'no-page-head', level: 'warning', file: 'src/layouts', message: 'Pages draw CMS entries, but nothing calls `pageHead`, so the SEO plugin and the editor\'s titles never reach the page\'s head.', see: 'Template helpers', fix: 'In the layout, call `const head = await pageHead(Astro, { title, description })` and write `head.title`, `head.description` and `head.robots`.' });
  }
  for (const file of sources) {
    const text = texts.get(file) ?? '';
    if (/\b(sharedConnection|createCms)\s*\(/.test(text) || /\.content\.(find|get|findBySlug)\s*\(/.test(text)) {
      add({ rule: 'reads-around-helpers', level: 'warning', file, message: 'This file reads the CMS around the helpers, which is how drafts leak onto pages and previews break.', see: 'Drafts never leak', fix: 'Read through `entryPage`, `single`, `menuLinks`, `linkTo` or the live loader (`getLiveCollection`, `getLiveEntry`).' });
    }
  }

  // 3. Every block has a component, and every component a block.
  const mapFile = sources.find((file) => /export\s+const\s+blocks\b/.test(texts.get(file) ?? '') && blockMapKeys(texts.get(file) ?? '') !== null);
  if (!types) {
    skipped.push(`Blocks and forms were not compared with the model: ${typesSkipped ?? 'the content types could not be read'}.`);
  } else {
    const blocks = siteBlocks(types);
    if (blocks.size > 0 && !mapFile) {
      add({ rule: 'no-block-map', level: 'error', file: 'src', message: `Pages are built from ${blocks.size} blocks, but no file maps them to components.`, see: 'Sections', fix: 'Write `export const blocks = { <block key>: Component }` (as `src/components/blocks.ts` in the starter) and draw a page\'s sections from it.' });
    }
    if (mapFile) {
      const mapText = texts.get(mapFile) ?? '';
      const mapped = blockMapKeys(mapText) ?? new Map<string, string>();
      for (const [key, block] of blocks) {
        if (!mapped.has(key)) add({ rule: 'block-without-component', level: 'error', file: mapFile, message: `The block "${key}" has no component, so its sections are left off every page.`, see: 'Sections', fix: `Write its component, import it here and add \`'${key}': Component\` to \`blocks\`.` });
        const takesForm = liveFields(block.fields).some((field) => field.type === 'form');
        const component = mapped.get(key);
        if (!takesForm || !component) continue;
        const from = new RegExp(`import\\s+${component}\\s+from\\s+['"]([^'"]+)['"]`).exec(mapText)?.[1];
        const resolved = from ? importsOf(dir, mapFile, `import x from '${from}'`)[0] : undefined;
        if (resolved && !/\bsiteForm\s*\(/.test(texts.get(resolved) ?? '')) {
          add({ rule: 'form-section-without-form', level: 'error', file: resolved, message: `The block "${key}" lets editors choose a form, but its component never calls \`siteForm\`, so the form is not drawn and nothing is received.`, see: 'Forms', fix: 'Call `const form = await siteForm(Astro, { id })` with the field\'s value and draw its fields, `form.hidden` and `form.trap`, posting to `form.action`.' });
        }
      }
      for (const key of mapped.keys()) {
        if (!blocks.has(key)) add({ rule: 'component-without-block', level: 'warning', file: mapFile, message: `"${key}" has a component but no block in the model, so editors cannot add it.`, see: 'Sections', fix: `Describe a block with the key "${key}" in the model and apply it (\`schema.define\`), or remove it here.` });
      }
    }
  }

  // 4. The agent files are there, and are this version's.
  const rules = path.join(dir, CMS_RULES_FILE);
  if (!fs.existsSync(rules)) {
    add({ rule: 'no-agent-rules', level: 'warning', file: CMS_RULES_FILE, message: 'The CMS\'s rules for agents are not installed.', see: 'Setup', fix: 'Run `npx velocity-cms agents`.' });
  } else if (!fs.readFileSync(rules, 'utf8').includes(`velocity-cms ${AGENT_FILES_VERSION}`)) {
    add({ rule: 'old-agent-rules', level: 'warning', file: CMS_RULES_FILE, message: 'The CMS\'s rules for agents are from another version of the CMS.', see: 'Setup', fix: 'Run `npx velocity-cms agents` to bring them up to date.' });
  }

  return { findings, skipped };
}

/** The result as a person reads it: one finding a few lines, the errors first. */
export function formatCheck({ findings, skipped }: CheckResult): string {
  const ordered = [...findings].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  const lines = ordered.map((finding) => `${finding.level === 'error' ? 'Error' : 'Warning'}: ${finding.file}\n  ${finding.message}\n  Rule: "${finding.see}" in ${CMS_RULES_FILE} (${finding.rule})\n  Fix: ${finding.fix}`);
  const errors = findings.filter((finding) => finding.level === 'error').length;
  const warnings = findings.length - errors;
  const summary = findings.length === 0 ? 'velocity-cms check: no problems found.' : `velocity-cms check: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}.`;
  return [...lines, ...skipped.map((line) => `Not checked: ${line}`), summary].join('\n\n');
}
