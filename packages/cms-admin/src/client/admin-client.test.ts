import { expect, it } from 'vitest';
import { adminClientContract } from '../testing/admin-client-contract.js';
import { createHttpServer } from '../testing/http-server.js';
import { MemoryAdminClient } from '../testing/memory-client.js';
import { sampleContentTypes, sampleUser } from '../testing/sample-content.js';
import { HttpAdminClient } from './http-client.js';

adminClientContract('MemoryAdminClient', async (seed) => new MemoryAdminClient({ ...seed, user: sampleUser }));
adminClientContract('HttpAdminClient with CmsApi', async (seed) => (await createHttpServer(seed, sampleUser)).client);

const auth = { requestSignInLink: async () => undefined, signInWithPasskey: async () => sampleUser, signOut: async () => undefined, registerPasskey: async () => undefined };

it('says who is signed in, and that nobody is once the session ends', async () => {
  const { client, authenticator } = await createHttpServer({ contentTypes: sampleContentTypes, entries: [] }, sampleUser);
  expect(await client.getSession()).toEqual(sampleUser);
  authenticator.session = null;
  expect(await client.getSession()).toBeNull();
  await expect(client.listContentTypes()).rejects.toMatchObject({ code: 'unauthenticated', message: 'Sign in to continue.' });
});

it('sends changes as JSON to the address the API is mounted at', async () => {
  const { client, requests } = await createHttpServer({ contentTypes: sampleContentTypes, entries: [] }, sampleUser);
  await client.createEntry({ type: 'agents', slug: 'sam-lee', data: {} });
  const sent = requests.at(-1);
  expect([sent?.method, sent?.url, sent?.headers.get('content-type')]).toEqual(['POST', 'https://site.test/api/cms/entries', 'application/json']);
});

it('explains a server that cannot be reached, or that answers with something else than JSON', async () => {
  const offline = new HttpAdminClient({ auth, fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
  await expect(offline.getSession()).rejects.toThrow('The server could not be reached. Check your connection and try again.');
  const broken = new HttpAdminClient({ auth, fetch: async () => new Response('<h1>Bad gateway</h1>', { status: 502 }) });
  await expect(broken.listContentTypes()).rejects.toMatchObject({ code: 'unknown', message: 'The server answered with an error (502). Try again in a moment.' });
});

it('hands signing in and out, and passkeys, to the auth client it was given', async () => {
  const asked: string[] = [];
  const named: string[] = [];
  const session = async () => new Response(JSON.stringify({ user: sampleUser }), { headers: { 'content-type': 'application/json' } });
  const client = new HttpAdminClient({
    auth: { ...auth, requestSignInLink: async (email) => void asked.push(email), registerPasskey: async (name) => void named.push(name) },
    baseUrl: '/cms/api/',
    fetch: session,
  });
  await client.requestSignInLink('dana@example.com');
  expect(asked).toEqual(['dana@example.com']);
  // Sign-in says a session started; who it is for, with their role, comes from the API.
  expect(await client.signInWithPasskey()).toEqual(sampleUser);
  await client.addPasskey('Laptop');
  expect(named).toEqual(['Laptop']);
});
