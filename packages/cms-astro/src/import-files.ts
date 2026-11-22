import fs from 'node:fs';
import path from 'node:path';

/** One entry read from a file, before it is sent: its slug, its language if it says one, and its values by key. */
export interface ImportItem {
  /** Where it came from, for the report. */
  readonly source: string;
  /** The folder of the file it came from, where pictures it names by a relative path are looked for. */
  readonly dir: string;
  readonly slug: string;
  readonly locale?: string;
  readonly values: Record<string, unknown>;
  /** The Markdown under the front matter, if the file was Markdown. */
  readonly body?: string;
}

const MARKDOWN = new Set(['.md', '.mdx', '.markdown']);

/** A slug made from a file's name or a title: lowercase words joined by hyphens. */
export function slugFrom(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/** One value of front matter: a quoted or plain string, a number, true or false, or `[a, b]`. */
function scalar(raw: string): unknown {
  const text = raw.trim();
  if (text === '' || text === '~' || text === 'null') return null;
  if (/^(['"])(.*)\1$/.test(text)) return text.slice(1, -1).replace(/\\"/g, '"').replace(/''/g, "'");
  if (text === 'true' || text === 'false') return text === 'true';
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith('[') && text.endsWith(']')) return text.slice(1, -1).split(',').map((part) => scalar(part)).filter((part) => part !== null);
  return text;
}

/**
 * The front matter of a Markdown file and what follows it. Only the plain part of YAML that
 * blogs use is read: `key: value`, lists of `- item` under a key, and `key: |` blocks of text.
 */
export function readFrontMatter(text: string): { readonly data: Record<string, unknown>; readonly body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  const data: Record<string, unknown> = {};
  const lines = (match[1] ?? '').split(/\r?\n/);
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at] ?? '';
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1] ?? '';
    const rest = pair[2] ?? '';
    if (rest === '|' || rest === '>') {
      const block: string[] = [];
      while (at + 1 < lines.length && /^\s+\S|^\s*$/.test(lines[at + 1] ?? '')) block.push((lines[++at] ?? '').replace(/^\s{2}/, ''));
      data[key] = block.join(rest === '|' ? '\n' : ' ').trim();
    } else if (rest.trim() === '') {
      const items: unknown[] = [];
      while (at + 1 < lines.length && /^\s*-\s+/.test(lines[at + 1] ?? '')) items.push(scalar((lines[++at] ?? '').replace(/^\s*-\s+/, '')));
      data[key] = items.length > 0 ? items : null;
    } else {
      data[key] = scalar(rest);
    }
  }
  return { data, body: match[2] ?? '' };
}

/**
 * What a file or a folder holds, as entries to import: a JSON file of a list of entries (each
 * `{ slug, locale?, data }`, or its values beside the slug), a Markdown file, or a folder of
 * Markdown files. A Markdown file's slug is its front matter's `slug`, else its file's name
 * (or its folder's, for `index.md`), so old addresses are kept.
 */
export function readImport(target: string): ImportItem[] {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    return fs
      .readdirSync(target, { recursive: true, encoding: 'utf8' })
      .filter((name) => MARKDOWN.has(path.extname(name).toLowerCase()))
      .sort()
      .map((name) => readMarkdown(path.join(target, name), path.relative(target, path.join(target, name))));
  }
  if (path.extname(target).toLowerCase() === '.json') {
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8')) as unknown;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((item, index) => {
      const record = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
      const { slug, locale, data, ...rest } = record;
      const values = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : rest;
      return { source: `${path.basename(target)} #${index + 1}`, dir: path.dirname(target), slug: typeof slug === 'string' ? slug : '', ...(typeof locale === 'string' && { locale }), values };
    });
  }
  return [readMarkdown(target, path.basename(target))];
}

function readMarkdown(file: string, source: string): ImportItem {
  const { data, body } = readFrontMatter(fs.readFileSync(file, 'utf8'));
  const { slug, locale, ...values } = data;
  const base = path.basename(file, path.extname(file));
  const named = base === 'index' ? path.basename(path.dirname(file)) : base;
  // A dated file name, `2024-05-01-hello.md`, keeps only its words.
  const fromName = slugFrom(named.replace(/^\d{4}-\d{2}-\d{2}-/, ''));
  return { source, dir: path.dirname(file), slug: typeof slug === 'string' && slug !== '' ? slug : fromName, ...(typeof locale === 'string' && { locale }), values, body };
}
