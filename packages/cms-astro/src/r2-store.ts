import type { MediaStore, StoredFile } from '@velocity-astro/cms-core';
import { workerBinding } from './d1-binding.js';
import { MEDIA_KEY, checkedMediaKey, mediaTypeOf } from './media-store.js';

/** The part of a Cloudflare R2 bucket binding this uses. */
export interface R2Bucket {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
}

/**
 * Keeps uploads in a Cloudflare R2 bucket the Worker is bound to. For a site on Cloudflare
 * Workers: no address and no keys, since the binding is the permission. The bucket stays
 * private: the site reads from it and serves the files itself.
 */
export class R2MediaStore implements MediaStore {
  readonly #bucket: () => Promise<R2Bucket>;

  /** `bucket` is asked for on first use: a binding is only there once a request is being answered. */
  constructor(bucket: () => Promise<R2Bucket>) {
    this.#bucket = bucket;
  }

  async put(key: string, file: StoredFile): Promise<void> {
    await (await this.#bucket()).put(checkedMediaKey(key), file.bytes, { httpMetadata: { contentType: file.contentType } });
  }

  async get(key: string): Promise<StoredFile | null> {
    if (!MEDIA_KEY.test(key)) return null;
    const found = await (await this.#bucket()).get(key);
    if (!found) return null;
    return { bytes: new Uint8Array(await found.arrayBuffer()), contentType: found.httpMetadata?.contentType ?? mediaTypeOf(key) };
  }

  async remove(key: string): Promise<void> {
    if (!MEDIA_KEY.test(key)) return;
    await (await this.#bucket()).delete(key);
  }
}

/**
 * The R2 bucket the server's settings name by its binding (`VELOCITY_CMS_R2_BUCKET=MEDIA` for a
 * bucket bound as `MEDIA` in the Wrangler config), or none.
 */
export function r2FromEnv(env: Readonly<Record<string, string | undefined>> = process.env): R2MediaStore | undefined {
  const name = env.VELOCITY_CMS_R2_BUCKET;
  if (!name) return undefined;
  if (!/^\w+$/.test(name)) throw new Error(`VELOCITY_CMS_R2_BUCKET is the name an R2 bucket is bound under in the Wrangler config, such as MEDIA. "${name}" cannot be one.`);
  let bound: Promise<R2Bucket> | undefined;
  return new R2MediaStore(() => {
    bound ??= workerBinding(name).then((found) => {
      const bucket = found?.binding as Partial<R2Bucket> | undefined;
      if (!bucket || typeof bucket.put !== 'function' || typeof bucket.get !== 'function') {
        bound = undefined;
        throw new Error(`There is no R2 bucket bound as "${name}". Add it to r2_buckets in the Wrangler config.`);
      }
      return bucket as R2Bucket;
    });
    return bound;
  });
}
