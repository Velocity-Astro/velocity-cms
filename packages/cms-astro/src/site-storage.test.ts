import { ConflictError, createCms, type Actor, type MediaStore, type StoredFile } from '@velocity-astro/cms-core';
import { InMemoryEntryRepository, InMemoryMediaStore, InMemorySchemaRepository } from '@velocity-astro/cms-core/testing';
import { expect, it } from 'vitest';
import { SiteMediaStore } from './site-storage.js';

const owner: Actor = { kind: 'user', id: 'u1', role: 'owner' };
const file: StoredFile = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/webp' };
const bucket = { endpoint: 'https://acct.r2.example.com', bucket: 'photos', accessKeyId: 'AKIA123', secretAccessKey: 'shh-secret', expectedRevision: 0 };

/** A bucket in memory that answers as a storage service would, and notes what it was asked. */
function service(refuse?: number) {
  const kept = new Map<string, Uint8Array>();
  const asked: { method: string; url: string; redirect: string | undefined; authorization: string }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    asked.push({ method, url, redirect: init?.redirect, authorization: new Headers(init?.headers).get('authorization') ?? '' });
    if (refuse !== undefined) return new Response('<Error>the service said something private</Error>', { status: refuse });
    if (method === 'PUT') kept.set(url, new Uint8Array(init?.body as Uint8Array));
    if (method === 'DELETE') kept.delete(url);
    if (method === 'GET') return kept.has(url) ? new Response(kept.get(url), { headers: { 'content-type': 'image/webp' } }) : new Response('', { status: 404 });
    return new Response('');
  };
  return { kept, asked, fetch };
}

function site(options: { fixed?: MediaStore; hosted?: boolean; folder?: MediaStore | null; refuse?: number; addresses?: string[] } = {}) {
  const cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), secret: 's'.repeat(32) });
  const remote = service(options.refuse);
  const folder = options.folder === null ? undefined : (options.folder ?? new InMemoryMediaStore());
  const store = new SiteMediaStore({
    account: () => cms.settings.bucketAccount(),
    fixed: options.fixed,
    ...(options.hosted !== undefined && { hosted: options.hosted }),
    folder,
    lookup: async () => options.addresses ?? ['203.0.113.7'],
    fetch: remote.fetch,
    believeForMs: 0,
  });
  cms.settings.useStorage(store.room());
  return { cms, store, remote, folder };
}

it('keeps uploads on the disk until an owner names a bucket, then in the bucket, and still reads what the disk holds', async () => {
  const { cms, store, remote, folder } = site();
  expect(await cms.settings.storage(owner)).toMatchObject({ keeping: 'folder', hasSecret: false });
  await store.put('porch.webp', file);
  expect(await folder?.get('porch.webp')).not.toBeNull();

  const saved = await cms.settings.saveStorage(owner, bucket);
  expect(saved).toEqual({ endpoint: 'https://acct.r2.example.com', bucket: 'photos', region: '', accessKeyId: 'AKIA123', hasSecret: true, keeping: 'bucket', revision: 1 });
  await store.put('kitchen.webp', file);
  expect([...remote.kept.keys()]).toEqual(['https://acct.r2.example.com/photos/kitchen.webp']);
  expect(await folder?.get('kitchen.webp')).toBeNull();
  expect(remote.asked.every((one) => one.redirect === 'error' && one.authorization.includes('Credential=AKIA123/'))).toBe(true);
  expect((await store.get('kitchen.webp'))?.bytes).toEqual(file.bytes);
  expect((await store.get('porch.webp'))?.bytes).toEqual(file.bytes);
  expect(await store.get('nothing.webp')).toBeNull();
  await store.remove('porch.webp');
  expect(await folder?.get('porch.webp')).toBeNull();

  await cms.settings.saveStorage(owner, { ...bucket, secretAccessKey: null, expectedRevision: 1 });
  expect(await cms.settings.storage(owner)).toMatchObject({ keeping: 'folder', hasSecret: false });
});

it('takes no uploads on a host with no disk until a bucket is named', async () => {
  const { cms, store } = site({ folder: null });
  expect(await store.ready()).toBe(false);
  expect(await cms.settings.storage(owner)).toMatchObject({ keeping: 'none' });
  await expect(store.put('porch.webp', file)).rejects.toThrow(/Settings, Storage/);
  expect(await store.get('porch.webp')).toBeNull();
  await cms.settings.saveStorage(owner, bucket);
  expect(await store.ready()).toBe(true);
  await store.put('porch.webp', file);
  expect((await store.get('porch.webp'))?.bytes).toEqual(file.bytes);
});

it('lets the server\'s settings and a host win over the editor\'s', async () => {
  const fixed = new InMemoryMediaStore();
  const server = site({ fixed });
  await server.cms.settings.saveStorage(owner, bucket);
  expect(await server.cms.settings.storage(owner)).toMatchObject({ fixedBy: 'server', keeping: 'bucket' });
  await server.store.put('porch.webp', file);
  expect(await fixed.get('porch.webp')).not.toBeNull();
  expect(server.remote.asked).toEqual([]);

  const hosted = site({ hosted: true, folder: null });
  await hosted.cms.settings.saveStorage(owner, bucket);
  expect(await hosted.cms.settings.storage(owner)).toMatchObject({ fixedBy: 'host', keeping: 'none' });
  expect(await hosted.store.ready()).toBe(false);
  expect(hosted.remote.asked).toEqual([]);
});

it('tries the bucket with a file it removes again, and says what to look at when it is refused', async () => {
  const works = site();
  await expect(works.cms.settings.testStorage(owner)).rejects.toThrow(/no bucket to try/);
  await works.cms.settings.saveStorage(owner, bucket);
  await works.cms.settings.testStorage(owner);
  expect(works.remote.asked.map((one) => one.method)).toEqual(['PUT', 'GET', 'DELETE']);
  expect(works.remote.kept.size).toBe(0);

  for (const [status, words] of [[403, /keys/], [404, /no bucket of this name/], [400, /region/], [500, /\(500\)/]] as const) {
    const { cms } = site({ refuse: status });
    await cms.settings.saveStorage(owner, bucket);
    const refused = await cms.settings.testStorage(owner).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ConflictError);
    expect((refused as Error).message).toMatch(words);
    expect((refused as Error).message).not.toContain('something private');
  }
});

it('never sends a file to an address that leads to a private machine', async () => {
  for (const addresses of [['10.0.0.5'], ['203.0.113.7', '127.0.0.1'], ['169.254.169.254'], []]) {
    const { cms, store, remote } = site({ addresses, folder: null });
    await cms.settings.saveStorage(owner, bucket);
    await expect(store.put('porch.webp', file)).rejects.toThrow(/leads nowhere this site may send files/);
    await expect(cms.settings.testStorage(owner)).rejects.toBeInstanceOf(ConflictError);
    expect(remote.asked).toEqual([]);
  }
});
