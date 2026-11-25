import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PACKAGE = '@velocity-astro/cms-astro';
const CONFIG_FILES = ['astro.config.mjs', 'astro.config.ts', 'astro.config.js', 'astro.config.mts'];
/** Where the database is kept unless the site says otherwise (see `connect`). */
const DATA_FOLDER = 'cms';
/** What the CMS writes in that folder: the database (with the files SQLite keeps beside it) and uploads. */
const KEPT_OUT = [`/${DATA_FOLDER}/data.db*`, `/${DATA_FOLDER}/media/`];

/** How this site's own scripts are run, from the lockfile its package manager left. */
export function runScript(dir: string, script: string): string {
  const has = (file: string) => fs.existsSync(path.join(dir, file));
  if (has('pnpm-lock.yaml')) return `pnpm ${script}`;
  if (has('yarn.lock')) return `yarn ${script}`;
  if (has('bun.lock') || has('bun.lockb')) return `bun run ${script}`;
  return `npm run ${script}`;
}

export interface InitOptions {
  /** The site's folder. */
  readonly dir: string;
  readonly print: (line: string) => void;
  /** Makes the site's secret. Tests give their own. */
  readonly secret?: () => string;
}

export interface InitResult {
  readonly code: number;
  /** The settings as they now are in `.env`, for whatever runs next in the same command. */
  readonly env: Readonly<Record<string, string>>;
}

/** The settings a `.env` file holds, by name. Quotes around a value are taken off. */
export function readEnvFile(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || match[1] === undefined) continue;
    found[match[1]] = (match[2] ?? '').replace(/^(['"])(.*)\1$/, '$2');
  }
  return found;
}

/**
 * The config with the integration added, or `null` when it cannot be added with certainty. Only
 * a config with one `integrations: [` list is changed; anything else is the person's to edit,
 * with the two lines printed for them.
 */
export function withIntegration(config: string): string | null {
  const lists = config.match(/\bintegrations\s*:\s*\[/g) ?? [];
  if (lists.length !== 1 || lists[0] === undefined) return null;
  const at = config.indexOf(lists[0]) + lists[0].length;
  const rest = config.slice(at);
  // An empty list takes the call alone; a list with something in it takes it first, with a comma.
  const isEmpty = /^\s*\]/.test(rest);
  // A list written over several lines takes a line of its own, set in as its neighbours are.
  const lines = /^[ \t]*\r?\n([ \t]*)/.exec(rest);
  const added = config.slice(0, at) + (isEmpty ? 'velocityCms()' : lines ? `\n${lines[1] ?? ''}velocityCms(),` : 'velocityCms(), ') + rest;
  const imports = [...added.matchAll(/^import\s.*$/gm)];
  const last = imports.at(-1);
  const line = `import velocityCms from '${PACKAGE}';`;
  if (!last || last.index === undefined) return `${line}\n\n${added}`;
  const end = last.index + last[0].length;
  return `${added.slice(0, end)}\n${line}${added.slice(end)}`;
}

const WRANGLER_FILES = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'];

/**
 * The names the site's Wrangler config binds its D1 databases and R2 buckets under, as far as
 * they can be read without Wrangler: enough to fill in a setting, never to decide anything else.
 */
export function wranglerBindings(text: string): { d1: string[]; r2: string[] } {
  const named = (list: string): string[] => {
    // JSON: the list's own brackets, and every "binding" inside it. A binding holds no bracket.
    const json = new RegExp(`"${list}"\\s*:\\s*\\[([^\\]]*)\\]`).exec(text)?.[1];
    if (json !== undefined) return [...json.matchAll(/"binding"\s*:\s*"(\w+)"/g)].map(([, name]) => name ?? '');
    // TOML: each [[list]] table, up to the next table.
    return [...text.matchAll(new RegExp(`^\\s*\\[\\[${list}\\]\\]([^\\[]*)`, 'gm'))].flatMap(([, table]) => /^\s*binding\s*=\s*"(\w+)"/m.exec(table ?? '')?.[1] ?? []);
  };
  return { d1: named('d1_databases'), r2: named('r2_buckets') };
}

/**
 * Sets a site up for the CMS, in its folder: a secret and the database's place in `.env`, both
 * kept out of git, and the integration in the Astro config. It can be run again: it adds only
 * what is missing and never changes a value that is there.
 */
export function initSite({ dir, print, secret = () => randomBytes(32).toString('base64url') }: InitOptions): InitResult {
  const at = (file: string) => path.join(dir, file);
  const configFile = CONFIG_FILES.find((file) => fs.existsSync(at(file)));
  if (!configFile) {
    print(`There is no Astro site in this folder (no ${CONFIG_FILES[0]}). Run this in the site's own folder.`);
    return { code: 1, env: {} };
  }

  // A site on Cloudflare Workers keeps its content in a D1 database and its uploads in an R2 bucket,
  // both named by the Wrangler config, and a Worker reads its settings from .env while developing.
  const cloudflare = /@astrojs\/cloudflare/.test(fs.readFileSync(at(configFile), 'utf8'));
  const wranglerFile = WRANGLER_FILES.find((file) => fs.existsSync(at(file)));
  const bound = wranglerBindings(wranglerFile ? fs.readFileSync(at(wranglerFile), 'utf8') : '');

  // 1. The secret, in .env. A value that is there is never replaced: sessions and saved keys depend on it.
  const envText = fs.existsSync(at('.env')) ? fs.readFileSync(at('.env'), 'utf8') : '';
  const env = readEnvFile(envText);
  const lines: string[] = [];
  if (!env['VELOCITY_CMS_SECRET']) {
    env['VELOCITY_CMS_SECRET'] = secret();
    lines.push('# Signs sessions, preview links and the keys plugins save. Keep it out of git, and set the same name on your host.', `VELOCITY_CMS_SECRET=${env['VELOCITY_CMS_SECRET']}`);
  }
  if (!env['VELOCITY_CMS_ORIGIN']) {
    env['VELOCITY_CMS_ORIGIN'] = 'http://localhost:4321';
    lines.push("# The site's address on this computer. On your host, set it to the real one, such as https://example.com.", `VELOCITY_CMS_ORIGIN=${env['VELOCITY_CMS_ORIGIN']}`);
  }
  if (cloudflare && !env['VELOCITY_CMS_DATABASE_URL'] && bound.d1.length === 1) {
    env['VELOCITY_CMS_DATABASE_URL'] = `d1:${bound.d1[0]}`;
    lines.push(`# The content: the D1 database ${wranglerFile} binds as ${bound.d1[0]}.`, `VELOCITY_CMS_DATABASE_URL=${env['VELOCITY_CMS_DATABASE_URL']}`);
  }
  if (cloudflare && !env['VELOCITY_CMS_R2_BUCKET'] && bound.r2.length === 1) {
    env['VELOCITY_CMS_R2_BUCKET'] = bound.r2[0] ?? '';
    lines.push(`# Uploads: the R2 bucket ${wranglerFile} binds as ${bound.r2[0]}.`, `VELOCITY_CMS_R2_BUCKET=${env['VELOCITY_CMS_R2_BUCKET']}`);
  }
  if (lines.length > 0) {
    fs.writeFileSync(at('.env'), `${envText}${envText === '' || envText.endsWith('\n') ? '' : '\n'}${envText === '' ? '' : '\n'}${lines.join('\n')}\n`);
    print('.env: added the settings the CMS needs.');
  } else {
    print('.env: already has the settings the CMS needs.');
  }

  // 2. Neither the secret nor the database belongs in git.
  const ignoreText = fs.existsSync(at('.gitignore')) ? fs.readFileSync(at('.gitignore'), 'utf8') : '';
  const ignored = ignoreText.split(/\r?\n/).map((line) => line.trim());
  // The database's folder is named from the top, so a `src/cms` of the site's own is still kept.
  const bare = (entry: string) => entry.replace(/^\/|\/$/g, '');
  // Only what the CMS writes there is left out: the site's own files in that folder (its model, its seed) are kept.
  const whole = ignored.some((line) => bare(line) === DATA_FOLDER);
  // On Workers there is no database file: what is left out is where Wrangler keeps the local stand-ins.
  const missing = ['.env', ...(cloudflare ? ['.wrangler/', '.dev.vars'] : whole ? [] : KEPT_OUT)].filter((entry) => !ignored.some((line) => bare(line) === bare(entry)));
  if (missing.length > 0) {
    fs.writeFileSync(at('.gitignore'), `${ignoreText}${ignoreText === '' || ignoreText.endsWith('\n') ? '' : '\n'}${missing.join('\n')}\n`);
    print(`.gitignore: now leaves out ${missing.join(' and ')}.`);
  }

  // 3. The integration.
  const config = fs.readFileSync(at(configFile), 'utf8');
  if (config.includes(PACKAGE)) {
    print(`${configFile}: already has the CMS.`);
  } else {
    const next = withIntegration(config);
    if (next) {
      fs.writeFileSync(at(configFile), next);
      print(`${configFile}: added the CMS to integrations.`);
    } else {
      print(`${configFile}: add these two lines yourself, since the file is not laid out as expected:\n\n  import velocityCms from '${PACKAGE}';\n  integrations: [velocityCms()],\n`);
    }
  }
  const latest = fs.readFileSync(at(configFile), 'utf8');
  if (!/\badapter\s*:/.test(latest)) {
    print(`${configFile}: has no adapter yet. The editor and live pages run on a server, so add one for where the site will live, for example \`npx astro add node\`.`);
  }
  if (!/\bsite\s*:/.test(latest)) {
    print(`${configFile}: has no \`site\` yet. Set it to the site's address before you deploy, so sign-in links lead there.`);
  }
  if (cloudflare) {
    if (!env['VELOCITY_CMS_DATABASE_URL']) {
      print(
        bound.d1.length > 1
          ? `.env: ${wranglerFile} binds several D1 databases (${bound.d1.join(', ')}). Say which holds the content: VELOCITY_CMS_DATABASE_URL=d1:<binding>.`
          : 'Cloudflare: the content needs a D1 database. Make one (`npx wrangler d1 create <name>`), add it to d1_databases in the Wrangler config, and set VELOCITY_CMS_DATABASE_URL=d1:<binding> in .env.',
      );
    }
    if (!env['VELOCITY_CMS_R2_BUCKET']) {
      print(
        bound.r2.length > 1
          ? `.env: ${wranglerFile} binds several R2 buckets (${bound.r2.join(', ')}). Say which keeps uploads: VELOCITY_CMS_R2_BUCKET=<binding>.`
          : 'Cloudflare: uploads need an R2 bucket. Make one (`npx wrangler r2 bucket create <name>`), add it to r2_buckets in the Wrangler config, and set VELOCITY_CMS_R2_BUCKET=<binding> in .env.',
      );
    }
    print('Cloudflare: .env is for this computer. For the deployed Worker, set the secret with `npx wrangler secret put VELOCITY_CMS_SECRET`, and VELOCITY_CMS_ORIGIN, VELOCITY_CMS_DATABASE_URL and VELOCITY_CMS_R2_BUCKET under "vars" in the Wrangler config.');
  }
  return { code: 0, env };
}

/**
 * Reads the CMS's own settings from the site's `.env` files into the environment, where the CMS
 * looks for them. Astro reads those files for the site's code but not for the server it runs
 * while developing and building. A setting the environment already has is left as it is.
 */
export function loadCmsEnv(dir: string, mode: string, env: Record<string, string | undefined> = process.env): void {
  // Later files are the more specific, so they are read first and win.
  for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) continue;
    for (const [name, value] of Object.entries(readEnvFile(fs.readFileSync(full, 'utf8')))) {
      if (name.startsWith('VELOCITY_CMS_') && !env[name]) env[name] = value;
    }
  }
}
