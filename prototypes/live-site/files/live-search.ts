/**
 * The search index for a live site. Written into `src/lib/live-search.ts` by the prototype.
 *
 * Pagefind indexes finished HTML. The build still indexes the pages it builds; this adds the live
 * ones by asking the running site for each page, then writes the index where the build put it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { liveAddresses } from '@/lib/live-site';

let running: Promise<{ pages: number }> | undefined;

async function rebuild(origin: string): Promise<{ pages: number }> {
  const client = path.join(process.cwd(), 'dist/client');
  const { createIndex, close } = await import('pagefind');
  const { index, errors } = await createIndex();
  if (!index) throw new Error(`Search could not start: ${errors.join(', ')}`);
  try {
    const built = await index.addDirectory({ path: client });
    let pages = built.page_count;
    for (const { path: address } of await liveAddresses()) {
      const response = await fetch(new URL(address, origin));
      if (!response.ok) continue;
      await index.addHTMLFile({ url: address, content: await response.text() });
      pages += 1;
    }
    const fresh = path.join(client, 'pagefind.next');
    fs.rmSync(fresh, { recursive: true, force: true });
    await index.writeFiles({ outputPath: fresh });
    fs.rmSync(path.join(client, 'pagefind'), { recursive: true, force: true });
    fs.renameSync(fresh, path.join(client, 'pagefind'));
    return { pages };
  } finally {
    await close();
  }
}

/** One rebuild at a time; a publish during a rebuild waits for it and then runs its own. */
export function rebuildSearchIndex(origin: string): Promise<{ pages: number }> {
  const next = (running ?? Promise.resolve()).catch(() => undefined).then(() => rebuild(origin));
  running = next;
  return next;
}
