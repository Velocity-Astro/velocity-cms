import { CmsApi } from '@velocity-astro/cms-api';
import { FixedAuthenticator } from '@velocity-astro/cms-api/testing';
import { createCms } from '@velocity-astro/cms-core';
import {
  InMemoryEntryRepository,
  InMemoryImageLibrary,
  InMemoryMediaRepository,
  InMemoryMediaStore,
  InMemorySchemaRepository,
} from '@velocity-astro/cms-core/in-memory';
import type { SessionUser } from '../client/admin-client.js';
import { HttpAdminClient } from '../client/http-client.js';
import { MemoryPeople } from './memory-people.js';
import { seedForms } from './memory-client.js';
import type { AdminClientSeed } from './admin-client-contract.js';

const ORIGIN = 'https://site.test';

/**
 * The real API over in-memory storage, with an `HttpAdminClient` whose requests go straight to
 * it. Everything between a screen and a service runs: JSON, status codes, the origin check.
 */
export async function createHttpServer(seed: AdminClientSeed, user: SessionUser) {
  const types = new InMemorySchemaRepository();
  const entries = new InMemoryEntryRepository();
  for (const type of seed.contentTypes) await types.save(type);
  for (const entry of seed.entries) await entries.save(entry, { expectedRevision: null, actorId: 'seed' });

  const authenticator = new FixedAuthenticator({ user, actor: { kind: 'user', id: user.id, role: user.role } });
  const storage = { files: new InMemoryMediaRepository(), store: new InMemoryMediaStore() };
  const people = new MemoryPeople(seed.people ?? [user]);
  const cms = createCms({ types, entries, team: people, previews: { secret: 'http-test-server-preview-secret-0' }, ...(seed.uploads !== false && { media: { storage } }) });
  cms.media.include(new InMemoryImageLibrary(seed.images));
  await seedForms(cms, seed.forms, seed.submissions);
  await cms.plugins.load(seed.plugins ?? []);
  const passkeys: { id: string; name: string }[] = [];
  const api = new CmsApi({ cms, authenticator, people });
  const requests: Request[] = [];
  const client = new HttpAdminClient({
    auth: {
      requestSignInLink: async () => undefined,
      signInWithPasskey: async () => user,
      signOut: async () => void (authenticator.session = null),
      registerPasskey: async (name) => void passkeys.push({ id: `passkey-${passkeys.length + 1}-${name}`, name }),
      listPasskeys: async () => [...passkeys],
      removePasskey: async (id) => void passkeys.splice(passkeys.findIndex((passkey) => passkey.id === id), 1),
    },
    fetch: (input, init) => {
      // A browser adds the page's origin to every request that changes something.
      const headers = new Headers(init?.headers);
      if (init?.method !== undefined && init.method !== 'GET') headers.set('origin', ORIGIN);
      const request = new Request(new URL(String(input), ORIGIN), { ...init, headers });
      requests.push(request.clone());
      return api.handle(request);
    },
  });
  return { client, authenticator, requests, passkeys };
}
