import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mediaStoreContract } from '@velocity/cms-core/testing';
import { describe, expect, it } from 'vitest';
import { FolderMediaStore, mediaStoreFromEnv, S3MediaStore } from './media-store.js';

/** A bucket in memory that answers as the protocol does. */
function fakeBucket() {
  const kept = new Map<string, { bytes: Uint8Array; type: string }>();
  const requests: Request[] = [];
  const fetch = async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    requests.push(request.clone());
    const key = new URL(request.url).pathname;
    if (!request.headers.get('authorization')?.startsWith('AWS4-HMAC-SHA256 ')) return new Response('<Error>AccessDenied</Error>', { status: 403 });
    if (request.method === 'PUT') {
      kept.set(key, { bytes: new Uint8Array(await request.arrayBuffer()), type: request.headers.get('content-type') ?? '' });
      return new Response(null, { status: 200 });
    }
    if (request.method === 'DELETE') {
      kept.delete(key);
      return new Response(null, { status: 204 });
    }
    const file = kept.get(key);
    return file ? new Response(file.bytes, { headers: { 'content-type': file.type } }) : new Response('<Error>NoSuchKey</Error>', { status: 404 });
  };
  return { fetch, requests, kept };
}

const account = {
  endpoint: 'https://acct.r2.cloudflarestorage.com/',
  bucket: 'velocity-cms-demo',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

mediaStoreContract('FolderMediaStore', async () => new FolderMediaStore(join(mkdtempSync(join(tmpdir(), 'cms-media-')), 'not-made-yet')));
mediaStoreContract('S3MediaStore', async () => new S3MediaStore({ ...account, fetch: fakeBucket().fetch }));

describe('S3MediaStore', () => {
  const now = () => new Date('2026-11-18T01:02:03.000Z');

  // The signatures are what botocore, Amazon's own client, makes for the same requests.
  it('signs a request the way the protocol asks', async () => {
    const bucket = fakeBucket();
    const store = new S3MediaStore({ ...account, fetch: bucket.fetch, now });
    await store.put('kitchen.jpg', { bytes: Uint8Array.from([1, 2, 3, 4]), contentType: 'image/jpeg' });
    await store.get('kitchen.jpg');

    const [put, get] = bucket.requests;
    expect(put?.url).toBe('https://acct.r2.cloudflarestorage.com/velocity-cms-demo/kitchen.jpg');
    expect(put?.headers.get('x-amz-date')).toBe('20261118T010203Z');
    expect(put?.headers.get('authorization')).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261118/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=3665e293e69e26529df31a1ed2e68bac692b6d9d158a7535592b2957cbafb0c4',
    );
    expect(get?.headers.get('authorization')).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261118/auto/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=ea915aa3fee050d2afafc921f76ad965dff4ffc39b2c0ebeb354c88845eeb6a6',
    );
  });

  it('says which bucket refused and why, without the key', async () => {
    const store = new S3MediaStore({ ...account, fetch: async () => new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 }) });
    const failure = await store.put('kitchen.jpg', { bytes: Uint8Array.from([1]), contentType: 'image/jpeg' }).catch((error: Error) => error.message);
    expect(failure).toContain('"velocity-cms-demo" refused to keep "kitchen.jpg" (403)');
    expect(failure).toContain('AccessDenied');
    expect(failure).not.toContain(account.secretAccessKey);
  });

  it('never asks the bucket for a name the CMS could not have made', async () => {
    const bucket = fakeBucket();
    const store = new S3MediaStore({ ...account, fetch: bucket.fetch });
    expect(await store.get('../other-bucket/secret.jpg')).toBeNull();
    await expect(store.put('a/b.jpg', { bytes: Uint8Array.from([1]), contentType: 'image/jpeg' })).rejects.toThrow('not a name');
    expect(bucket.requests).toEqual([]);
  });
});

describe('mediaStoreFromEnv', () => {
  const s3 = {
    VELOCITY_CMS_S3_BUCKET: 'photos',
    VELOCITY_CMS_S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
    VELOCITY_CMS_S3_ACCESS_KEY_ID: 'id',
    VELOCITY_CMS_S3_SECRET_ACCESS_KEY: 'secret',
  };

  it('uses a bucket when one is set up, whatever the database is', () => {
    expect(mediaStoreFromEnv('file:./cms/data.db', s3)).toBeInstanceOf(S3MediaStore);
  });

  it('refuses a bucket that is set up only in part, and names what is needed', () => {
    expect(() => mediaStoreFromEnv('libsql://x.turso.io', { ...s3, VELOCITY_CMS_S3_SECRET_ACCESS_KEY: '' })).toThrow('VELOCITY_CMS_S3_SECRET_ACCESS_KEY');
  });

  it('keeps uploads in a folder beside a database that is a file, or in the folder it is told', () => {
    expect(mediaStoreFromEnv('file:./cms/data.db', {})).toBeInstanceOf(FolderMediaStore);
    expect(mediaStoreFromEnv('libsql://x.turso.io', { VELOCITY_CMS_MEDIA_DIR: './uploads' })).toBeInstanceOf(FolderMediaStore);
  });

  it('takes no uploads on a host with a hosted database and no bucket', () => {
    expect(mediaStoreFromEnv('libsql://x.turso.io', {})).toBeUndefined();
  });
});
