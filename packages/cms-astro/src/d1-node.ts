import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { D1Binding } from '@velocity-astro/cms-db';
import type { BoundDatabase } from './d1-binding.js';

interface Wrangler {
  getPlatformProxy(options: { environment?: string; persist?: { path: string } }): Promise<{ env: Record<string, unknown>; dispose(): Promise<void> }>;
}

/** Wrangler as the site installed it: it is the site's own tool, and never this package's. */
async function siteWrangler(): Promise<Wrangler> {
  let entry: string;
  try {
    entry = createRequire(path.join(process.cwd(), 'package.json')).resolve('wrangler');
  } catch {
    throw new Error('A D1 database is reached from this computer through Wrangler, which this site does not have. Install it (`npm install --save-dev wrangler`) and run the command from the site\'s folder.');
  }
  const loaded = (await import(pathToFileURL(entry).href)) as Partial<Wrangler> & { default?: Partial<Wrangler> };
  const getPlatformProxy = loaded.getPlatformProxy ?? loaded.default?.getPlatformProxy;
  if (!getPlatformProxy) throw new Error('This version of Wrangler cannot hand a program its bindings (getPlatformProxy). Update Wrangler.');
  return { getPlatformProxy };
}

/**
 * The D1 database Wrangler binds under `name` for a program on this computer.
 *
 * `CLOUDFLARE_ENV` names the environment of the Wrangler config to read, as it does for Wrangler.
 * `VELOCITY_CMS_WRANGLER_STATE` is where local data is kept when it is not `.wrangler/state`:
 * the folder given to `wrangler dev --persist-to`.
 */
export async function wranglerBinding(name: string): Promise<BoundDatabase> {
  const { getPlatformProxy } = await siteWrangler();
  const environment = process.env.CLOUDFLARE_ENV || undefined;
  const state = process.env.VELOCITY_CMS_WRANGLER_STATE || undefined;
  const proxy = await getPlatformProxy({
    ...(environment !== undefined && { environment }),
    ...(state !== undefined && { persist: { path: path.join(path.resolve(state), 'v3') } }),
  });
  const binding = proxy.env[name] as D1Binding | undefined;
  if (!binding || typeof binding.prepare !== 'function') {
    await proxy.dispose();
    throw new Error(`The Wrangler config has no D1 database bound as "${name}". Add it to d1_databases.`);
  }
  return { binding, release: () => proxy.dispose() };
}
