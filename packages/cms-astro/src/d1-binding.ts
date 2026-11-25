import type { D1Binding } from '@velocity-astro/cms-db';

/** Something a Worker is bound to, and how to let go of what was started to reach it. */
export interface Bound<T> {
  readonly binding: T;
  release(): Promise<void>;
}

/** A D1 database that was reached. */
export type BoundDatabase = Bound<D1Binding>;

export const inWorker = (): boolean => typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

/**
 * What the Wrangler config binds under `name`: a D1 database, an R2 bucket.
 *
 * In a Worker it is the Worker's own binding. Anywhere else (the `velocity-cms` command, a seed
 * script) it is the one Wrangler hands a program on this computer: the local stand-in
 * `wrangler dev` and `astro dev` use, or the real thing where the Wrangler config marks the
 * binding `"remote": true`. `null` when nothing is bound under the name.
 */
export async function workerBinding(name: string): Promise<Bound<unknown> | null> {
  if (!inWorker()) return (await import('./d1-node.js')).wranglerBinding(name);
  // A name the bundler leaves alone: only the Workers runtime has this module.
  const workers = 'cloudflare:workers';
  const { env } = (await import(/* @vite-ignore */ workers)) as { env: Record<string, unknown> };
  const binding = env[name];
  return binding === undefined || binding === null ? null : { binding, release: async () => undefined };
}

/** The D1 database bound under `name`. */
export async function d1Binding(name: string): Promise<BoundDatabase> {
  const found = await workerBinding(name);
  if (!found || typeof (found.binding as Partial<D1Binding>).prepare !== 'function') {
    await found?.release();
    throw new Error(`There is no D1 database bound as "${name}". Add it to d1_databases in the Wrangler config.`);
  }
  return found as BoundDatabase;
}
