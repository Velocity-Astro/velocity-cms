import fs from 'node:fs';
import path from 'node:path';
import { readImport, slugFrom } from './import-files.js';
import { SiteClient, SiteRefusal } from './site-client.js';

/** A command's words, split into what it names in order and what it sets with `--name value` or `--flag`. */
export interface Parsed {
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string | true>>;
  /** Every value a flag was given, for one that may be given more than once (`--map a=b --map c=d`). */
  readonly all: Readonly<Record<string, readonly string[]>>;
}

/** Flags that take no value. Every other flag takes the word after it. */
const SWITCHES = new Set(['json', 'publish', 'personal-data', 'save', 'update', 'dry-run', 'help']);

export function parseArgs(args: readonly string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  const all: Record<string, string[]> = {};
  for (let at = 0; at < args.length; at++) {
    const arg = args[at] ?? '';
    const flag = /^--([a-z][a-z-]*)(?:=(.*))?$/.exec(arg);
    if (!flag) {
      positional.push(arg);
      continue;
    }
    const name = flag[1] ?? '';
    const value = flag[2] ?? (SWITCHES.has(name) ? true : args[++at]);
    if (value === undefined) continue;
    flags[name] = value;
    if (typeof value === 'string') (all[name] ??= []).push(value);
  }
  return { positional, flags, all };
}

export interface ContentEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly print: (line: string) => void;
  readonly dir: string;
  /** Lines read from the agent, for `mcp`. Defaults to the process's standard input. */
  readonly input?: AsyncIterable<string>;
  readonly fetch?: typeof fetch;
}

/** The commands that work with a site's content, over its API. Each answers with the exit code, or `null` for a command it does not know. */
export const CONTENT_COMMANDS = new Set(['types', 'type', 'entries', 'entry', 'create', 'update', 'publish', 'unpublish', 'sections', 'import', 'export', 'forms', 'submissions', 'pipeline', 'upload', 'mcp']);

export const CONTENT_USAGE = `Content, over the site's API (needs VELOCITY_CMS_TOKEN, and VELOCITY_CMS_ORIGIN for a site that is not on this computer):
  velocity-cms types                            The content types and their fields.
  velocity-cms type <type>                      One content type in full, with the blocks its pages take.
  velocity-cms entries <type> [--status s] [--locale l] [--limit n]
  velocity-cms entry <id>                       One entry, its values by field key.
  velocity-cms create <type> <slug> --data '<json>' [--locale l] [--publish]
  velocity-cms update <id> --data '<json>' [--publish]
  velocity-cms publish <id> | unpublish <id>
  velocity-cms sections <id>                    A page's sections, in order.
  velocity-cms import <type> <file.json | file.md | folder> [--publish] [--body <field>] [--map old=new] [--update] [--dry-run]
  velocity-cms export <type> [--out <file.json>]
  velocity-cms upload <image>                   Prints the name an image field stores.
  velocity-cms forms | submissions <form> | pipeline
  velocity-cms mcp                              An MCP server on standard input and output, for an agent on this computer.
  Add --json to print what the site answered as it is.`;

/** Runs one content command. */
export async function runContentCommand(command: string, parsed: Parsed, environment: ContentEnvironment): Promise<number> {
  const { print } = environment;
  const origin = (typeof parsed.flags['site'] === 'string' ? parsed.flags['site'] : undefined) ?? environment.env['VELOCITY_CMS_ORIGIN'];
  const token = (typeof parsed.flags['token'] === 'string' ? parsed.flags['token'] : undefined) ?? environment.env['VELOCITY_CMS_TOKEN'];
  if (!origin) {
    print('VELOCITY_CMS_ORIGIN is not set. Run `velocity-cms init` in the site\'s folder, or pass --site https://example.com.');
    return 1;
  }
  if (!token) {
    print('VELOCITY_CMS_TOKEN is not set. Make a token with `velocity-cms token "<what it is for>" --save`, or in the editor under Settings, Access tokens, and put it in .env.');
    return 1;
  }
  const site = new SiteClient({ origin, token, ...(environment.fetch && { fetch: environment.fetch }) });
  const json = parsed.flags['json'] === true;
  const show = (value: unknown) => print(JSON.stringify(value, null, 2));
  const [first, second] = parsed.positional;
  const need = (value: string | undefined, what: string): string => {
    if (value === undefined || value === '') throw new SiteRefusal(`Give ${what}.\n\n${CONTENT_USAGE}`);
    return value;
  };
  const data = (): Record<string, unknown> => {
    const raw = typeof parsed.flags['data'] === 'string' ? parsed.flags['data'] : typeof parsed.flags['file'] === 'string' ? fs.readFileSync(path.resolve(environment.dir, parsed.flags['file']), 'utf8') : '{}';
    try {
      const value = JSON.parse(raw) as unknown;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
      // Said below, in one place.
    }
    throw new SiteRefusal('--data must be a JSON object of values by field key, such as \'{"title": "Hello"}\'.');
  };
  const publish = parsed.flags['publish'] === true;

  try {
    switch (command) {
      case 'mcp':
        return await relay(site, environment);
      case 'types': {
        const site_ = await site.tool<{ contentTypes: { key: string; kind: string; urlPattern?: string; fields: string[] }[] }>('describe_site');
        if (json) show(site_);
        else for (const type of site_.contentTypes) print(`${type.key} (${type.kind}${type.urlPattern ? `, ${type.urlPattern}` : ''}): ${type.fields.join(', ')}`);
        return 0;
      }
      case 'type':
        show(await site.tool('get_content_type', { type: need(first, 'a content type\'s key') }));
        return 0;
      case 'entries': {
        const list = await site.tool<{ total: number; items: { id: string; title: string; slug: string; locale: string; status: string }[] }>('list_entries', {
          type: need(first, 'a content type\'s key'),
          ...(typeof parsed.flags['status'] === 'string' && { status: parsed.flags['status'] }),
          ...(typeof parsed.flags['locale'] === 'string' && { locale: parsed.flags['locale'] }),
          ...(typeof parsed.flags['slug'] === 'string' && { slug: parsed.flags['slug'] }),
          ...(typeof parsed.flags['limit'] === 'string' && { limit: Number(parsed.flags['limit']) }),
        });
        if (json) show(list);
        else {
          for (const entry of list.items) print(`${entry.id}  ${entry.status.padEnd(9)} ${entry.locale}  ${entry.slug}  ${entry.title}`);
          print(`${list.items.length} of ${list.total}.`);
        }
        return 0;
      }
      case 'entry':
        show(await site.tool('get_entry', { id: need(first, 'an entry\'s id') }));
        return 0;
      case 'create':
        show(await site.tool('create_entry', { type: need(first, 'a content type\'s key'), slug: need(second, 'a slug'), data: data(), publish, ...(typeof parsed.flags['locale'] === 'string' && { locale: parsed.flags['locale'] }) }));
        return 0;
      case 'update':
        show(await site.tool('update_entry', { id: need(first, 'an entry\'s id'), data: data(), publish }));
        return 0;
      case 'publish':
      case 'unpublish':
        show(await site.tool(`${command}_entry`, { id: need(first, 'an entry\'s id') }));
        return 0;
      case 'sections':
        show(await site.tool('get_sections', { id: need(first, 'an entry\'s id') }));
        return 0;
      case 'forms':
        show(await site.tool('list_forms'));
        return 0;
      case 'submissions':
        show(await site.tool('list_submissions', { form: need(first, 'a form\'s key') }));
        return 0;
      case 'pipeline':
        show(await site.tool('get_pipeline'));
        return 0;
      case 'upload': {
        const file = path.resolve(environment.dir, need(first, 'an image file'));
        const image = await site.upload(path.basename(file), fs.readFileSync(file));
        if (json) show(image);
        else print(image.name);
        return 0;
      }
      case 'export':
        return await exportType(site, need(first, 'a content type\'s key'), parsed, environment);
      case 'import':
        return await importInto(site, need(first, 'a content type\'s key'), path.resolve(environment.dir, need(second, 'a file or a folder to import')), parsed, environment);
      default:
        print(CONTENT_USAGE);
        return 1;
    }
  } catch (error) {
    if (!(error instanceof SiteRefusal)) throw error;
    print(error.message);
    return 1;
  }
}

/**
 * An MCP server on standard input and output, for an agent that starts a command: each message
 * is handed to the site's own MCP server with the token, and its answer printed back. Nothing is
 * decided here, so the agent gets exactly what the site would give it over HTTP.
 */
async function relay(site: SiteClient, environment: ContentEnvironment): Promise<number> {
  const write = (line: string) => process.stdout.write(`${line}\n`);
  const input = environment.input ?? readLines(process.stdin);
  for await (const line of input) {
    if (line.trim() === '') continue;
    let id: unknown = null;
    try {
      id = (JSON.parse(line) as { id?: unknown }).id ?? null;
      const answer = await site.relay(line);
      if (answer !== null) write(answer);
    } catch (error) {
      if (id === null) continue;
      const message = error instanceof SiteRefusal ? error.message : 'The site could not be reached.';
      write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message } }));
    }
  }
  return 0;
}

async function* readLines(stream: NodeJS.ReadableStream): AsyncIterable<string> {
  let rest = '';
  for await (const chunk of stream) {
    rest += String(chunk);
    const lines = rest.split('\n');
    rest = lines.pop() ?? '';
    yield* lines;
  }
  if (rest !== '') yield rest;
}

interface ListedEntry {
  readonly id: string;
}

async function exportType(site: SiteClient, type: string, parsed: Parsed, { print, dir }: ContentEnvironment): Promise<number> {
  const entries: unknown[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await site.tool<{ total: number; items: ListedEntry[] }>('list_entries', { type, limit: 200, offset });
    for (const item of page.items) {
      const entry = await site.tool<{ slug: string; locale: string; status: string; data: unknown }>('get_entry', { id: item.id });
      entries.push({ slug: entry.slug, locale: entry.locale, status: entry.status, data: entry.data });
    }
    if (page.items.length === 0 || offset + page.items.length >= page.total) break;
  }
  const text = `${JSON.stringify(entries, null, 2)}\n`;
  const out = parsed.flags['out'];
  if (typeof out === 'string') {
    fs.writeFileSync(path.resolve(dir, out), text);
    print(`Wrote ${entries.length} ${type} to ${out}. \`velocity-cms import ${type} ${out}\` brings them into another site.`);
  } else {
    print(text.trimEnd());
  }
  return 0;
}

interface DescribedField {
  readonly key: string;
  readonly type: string;
  readonly required?: boolean;
}

/**
 * Brings entries in from files, as drafts unless `--publish`: keys the content type has no field
 * for are left out and named, a picture an image field names by a path on this computer is
 * uploaded, and the Markdown under front matter goes into the formatted text field. An entry
 * whose slug is taken is left as it is unless `--update`. Ends with what came in and what did not.
 */
async function importInto(site: SiteClient, typeKey: string, target: string, parsed: Parsed, { print }: ContentEnvironment): Promise<number> {
  if (!fs.existsSync(target)) throw new SiteRefusal(`There is nothing at ${target}.`);
  const type = await site.tool<{ key: string; fields: DescribedField[] }>('get_content_type', { type: typeKey });
  const fields = new Map(type.fields.map((field) => [field.key, field]));
  const renames = new Map((parsed.all['map'] ?? []).map((pair) => pair.split('=') as [string, string]).filter(([from, to]) => from && to));
  const asked = parsed.flags['body'];
  const rich = type.fields.filter((field) => field.type === 'richtext');
  const bodyKey = typeof asked === 'string' ? asked : (rich.find((field) => ['body', 'content', 'text'].includes(field.key)) ?? rich[0])?.key;
  const titleKey = type.fields.find((field) => field.key === 'title')?.key ?? type.fields.find((field) => field.type === 'text')?.key;
  const dryRun = parsed.flags['dry-run'] === true;
  const items = readImport(target);
  const leftOut = new Set<string>();
  const report = { created: 0, updated: 0, unchanged: [] as string[], refused: [] as string[], pictures: 0 };

  for (const item of items) {
    const values: Record<string, unknown> = {};
    for (const [rawKey, value] of Object.entries(item.values)) {
      const key = renames.get(rawKey) ?? rawKey;
      const field = fields.get(key);
      if (!field) {
        leftOut.add(rawKey);
        continue;
      }
      values[key] = value;
      // A picture named by a path on this computer is uploaded, and the field holds its name.
      const local = typeof value === 'string' && field.type === 'image' && !/^[a-z]+:\/\//i.test(value) ? path.resolve(item.dir, value.replace(/^\//, '')) : null;
      if (local && fs.existsSync(local)) {
        if (!dryRun) values[key] = (await site.upload(path.basename(local), fs.readFileSync(local))).name;
        report.pictures += 1;
      }
    }
    if (item.body !== undefined && item.body.trim() !== '') {
      if (bodyKey && fields.has(bodyKey)) values[bodyKey] = { markdown: item.body };
      else leftOut.add('(the text under the front matter: name a field with --body)');
    }
    const title = titleKey ? values[titleKey] : undefined;
    const slug = item.slug !== '' ? item.slug : typeof title === 'string' ? slugFrom(title) : '';
    if (slug === '') {
      report.refused.push(`${item.source}: no slug, and no title to make one from.`);
      continue;
    }
    if (dryRun) {
      report.created += 1;
      continue;
    }
    try {
      const found = await site.tool<{ items: ListedEntry[] }>('list_entries', { type: typeKey, slug, ...(item.locale && { locale: item.locale }), limit: 1 });
      const existing = found.items[0];
      if (existing && parsed.flags['update'] !== true) {
        report.unchanged.push(`${item.source}: ${slug} is already here (add --update to change it).`);
        continue;
      }
      if (existing) {
        await site.tool('update_entry', { id: existing.id, data: values, publish: parsed.flags['publish'] === true });
        report.updated += 1;
      } else {
        await site.tool('create_entry', { type: typeKey, slug, data: values, publish: parsed.flags['publish'] === true, ...(item.locale && { locale: item.locale }) });
        report.created += 1;
      }
    } catch (error) {
      if (!(error instanceof SiteRefusal)) throw error;
      report.refused.push(`${item.source}: ${error.message.split('\n').join(' ')}`);
    }
  }

  const state = parsed.flags['publish'] === true ? 'published' : 'as drafts';
  print(`${dryRun ? 'Would import' : 'Imported'} ${report.created} new ${typeKey} ${state}${report.updated > 0 ? ` and updated ${report.updated}` : ''}, from ${items.length} found.${report.pictures > 0 ? ` ${report.pictures} pictures ${dryRun ? 'would be' : 'were'} uploaded.` : ''}`);
  if (leftOut.size > 0) print(`Left out, since ${typeKey} has no field for them: ${[...leftOut].join(', ')}. Name a field with --map old=new to keep one.`);
  if (items.some((item) => item.body?.includes('!['))) print('Pictures inside the text were left out: formatted text holds no pictures. Add them to an image field, or as sections.');
  for (const line of [...report.unchanged, ...report.refused]) print(`  ${line}`);
  return report.refused.length > 0 ? 1 : 0;
}
