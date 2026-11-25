import type { D1Binding } from '@velocity-astro/cms-db';

/** A D1 database that was reached, and how to let go of what was started to reach it. */
export interface BoundDatabase {
  readonly binding: D1Binding;
  release(): Promise<void>;
}

export const inWorker = (): boolean => typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

/**
 * The D1 database bound under `name`.
 *
 * In a Worker it is the Worker's own binding. Anywhere else (the `velocity-cms` command, a seed
 * script) it is the one Wrangler hands a program on this computer: the local database
 * `wrangler dev` and `astro dev` use, or the real one where the Wrangler config marks the
 * binding `"remote": true`.
 */
export async function d1Binding(name: string): Promise<BoundDatabase> {
  if (!inWorker()) return (await import('./d1-node.js')).wranglerBinding(name);
  // A name the bundler leaves alone: only the Workers runtime has this module.
  const workers = 'cloudflare:workers';
  const { env } = (await import(/* @vite-ignore */ workers)) as { env: Record<string, D1Binding | undefined> };
  const binding = env[name];
  if (!binding) throw new Error(`There is no D1 database bound as "${name}". Add it to d1_databases in the Wrangler config.`);
  return { binding, release: async () => undefined };
}
