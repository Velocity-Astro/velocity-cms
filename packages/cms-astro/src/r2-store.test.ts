import { describe, expect, it } from 'vitest';
import { mediaStoreContract } from '@velocity-astro/cms-core/testing';
import { R2MediaStore, r2FromEnv, type R2Bucket } from './r2-store.js';

/** A stand-in for an R2 bucket binding. */
function fakeBucket(): R2Bucket & { kept: Map<string, { bytes: Uint8Array; contentType: string | undefined }> } {
  const kept = new Map<string, { bytes: Uint8Array; contentType: string | undefined }>();
  return {
    kept,
    put: async (key, value, options) => {
      kept.set(key, { bytes: Uint8Array.from(value), contentType: options?.httpMetadata?.contentType });
    },
    get: async (key) => {
      const found = kept.get(key);
      if (!found) return null;
      return { arrayBuffer: async () => Uint8Array.from(found.bytes).buffer, ...(found.contentType !== undefined && { httpMetadata: { contentType: found.contentType } }) };
    },
    delete: async (key) => {
      kept.delete(key);
    },
  };
}

mediaStoreContract('R2MediaStore', async () => {
  const bucket = fakeBucket();
  return new R2MediaStore(async () => bucket);
});

describe('R2MediaStore', () => {
  it('refuses to keep a file under a name that could reach outside the bucket\'s own files', async () => {
    const bucket = fakeBucket();
    const store = new R2MediaStore(async () => bucket);
    await expect(store.put('../kitchen.jpg', { bytes: new Uint8Array([1]), contentType: 'image/jpeg' })).rejects.toThrow('not a name');
    expect(bucket.kept.size).toBe(0);
  });

  it('asks for the bucket only when a file is kept or read', async () => {
    let asked = 0;
    const bucket = fakeBucket();
    const store = new R2MediaStore(async () => {
      asked += 1;
      return bucket;
    });
    expect(asked).toBe(0);
    expect(await store.get('missing.jpg')).toBeNull();
    expect(asked).toBe(1);
  });
});

describe('r2FromEnv', () => {
  it('is nothing until a binding is named', () => {
    expect(r2FromEnv({})).toBeUndefined();
  });

  it('takes the name of a binding and nothing else', () => {
    expect(r2FromEnv({ VELOCITY_CMS_R2_BUCKET: 'MEDIA' })).toBeInstanceOf(R2MediaStore);
    expect(() => r2FromEnv({ VELOCITY_CMS_R2_BUCKET: 'my-bucket/photos' })).toThrow('cannot be one');
  });
});
