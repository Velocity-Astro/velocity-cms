import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Bound } from './d1-binding.js';

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
  const loaded = (await import(/* @vite-ignore */ pathToFileURL(entry).href)) as Partial<Wrangler> & { default?: Partial<Wrangler> };
  const getPlatformProxy = loaded.getPlatformProxy ?? loaded.default?.getPlatformProxy;
  if (!getPlatformProxy) throw new Error('This version of Wrangler cannot hand a program its bindings (getPlatformProxy). Update Wrangler.');
  return { getPlatformProxy };
}

/** One stand-in for the Worker's bindings for the whole program, started on first use and let go when nobody holds it. */
let proxy: Promise<{ env: Record<string, unknown>; dispose(): Promise<void> }> | undefined;
let holders = 0;

/**
 * What Wrangler binds under `name` for a program on this computer, or `null` for nothing.
 *
 * `CLOUDFLARE_ENV` names the environment of the Wrangler config to read, as it does for Wrangler.
 * `VELOCITY_CMS_WRANGLER_STATE` is where local data is kept when it is not `.wrangler/state`:
 * the folder given to `wrangler dev --persist-to`.
 */
export async function wranglerBinding(name: string): Promise<Bound<unknown> | null> {
  if (!proxy) {
    const environment = process.env.CLOUDFLARE_ENV || undefined;
    const state = process.env.VELOCITY_CMS_WRANGLER_STATE || undefined;
    proxy = siteWrangler().then(({ getPlatformProxy }) =>
      getPlatformProxy({
        ...(environment !== undefined && { environment }),
        ...(state !== undefined && { persist: { path: path.join(path.resolve(state), 'v3') } }),
      }),
    );
    // A stand-in that could not be started is not remembered, so the next use says why again.
    proxy.catch(() => (proxy = undefined));
  }
  const started = await proxy;
  const binding = started.env[name];
  if (binding === undefined || binding === null) {
    if (holders === 0) {
      proxy = undefined;
      await started.dispose();
    }
    return null;
  }
  holders += 1;
  let held = true;
  return {
    binding,
    release: async () => {
      if (!held) return;
      held = false;
      holders -= 1;
      if (holders > 0) return;
      proxy = undefined;
      await started.dispose();
    },
  };
}
