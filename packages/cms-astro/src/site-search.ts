/**
 * Search for a live site, kept in the CMS database. A search document is a page as a visitor
 * reads it, so results match what is on the site. After a publish only the pages that changed
 * are read again, which keeps search as fresh as the page.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SearchDocument, SearchResults } from '@velocity/cms-core';
import { sharedConnection } from './connection.js';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (text: string) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name: string) => ENTITIES[name] ?? '');
const plain = (html: string) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const documentId = (address: string) => `page:${address}`;

/**
 * The searchable part of a finished page: what sits inside `data-pagefind-body`, the mark Velocity
 * layouts already put on real content. A page without it (search results, 404) is not searchable.
 */
export function toSearchDocument(address: string, html: string): SearchDocument | null {
  const start = html.search(/<[^>]+\sdata-pagefind-body/);
  if (start === -1) return null;
  const end = html.indexOf('</main>', start);
  const content = html
    .slice(start, end === -1 ? undefined : end)
    .replace(/<(script|style|svg|template|noscript)\b[\s\S]*?<\/\1>/g, ' ');
  const heading = content.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1];
  const title = heading ? plain(heading) : decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? address);
  return {
    id: documentId(address),
    locale: html.match(/<html[^>]*\slang="([^"]+)"/)?.[1] ?? 'en',
    url: address,
    title,
    body: plain(content),
  };
}

const index = async () => (await sharedConnection({})).search;

/** Reads these pages again from the running site and updates their search entries. */
export async function indexPages(origin: string, addresses: readonly string[]): Promise<number> {
  const documents: SearchDocument[] = [];
  const gone: string[] = [];
  const queue = [...addresses];
  const worker = async () => {
    for (let address = queue.shift(); address !== undefined; address = queue.shift()) {
      const response = await fetch(new URL(address, origin));
      const document = response.ok ? toSearchDocument(address, await response.text()) : null;
      if (document) documents.push(document);
      else gone.push(documentId(address));
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  const search = await index();
  await search.put(documents);
  await search.remove(gone);
  return documents.length;
}

/** Every page: the ones the build made, read from `clientDir`, and the live ones. Run once after a deploy. */
export async function indexSite(origin: string, clientDir: string, addresses: readonly string[]): Promise<number> {
  const built = fs
    .readdirSync(clientDir, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('index.html'))
    .map((file) => {
      const address = `/${file.replaceAll('\\', '/').replace(/index\.html$/, '')}`;
      return toSearchDocument(address, fs.readFileSync(path.join(clientDir, file), 'utf8'));
    })
    .filter((document) => document !== null);
  await (await index()).put(built);
  return built.length + (await indexPages(origin, addresses));
}

export async function searchSite(text: string, locale: string | undefined): Promise<SearchResults> {
  return (await index()).search({ text, ...(locale !== undefined && { locale }) });
}
