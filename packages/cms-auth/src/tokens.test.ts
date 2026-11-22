import { CmsApi } from '@velocity-astro/cms-api';
import { createCms, type Actor } from '@velocity-astro/cms-core';
import { InMemoryEntryRepository, InMemorySchemaRepository } from '@velocity-astro/cms-core/in-memory';
import { authToken, openDatabase, type Database } from '@velocity-astro/cms-db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CmsAuth } from './auth.js';
import { MemoryMailer } from './mailer.js';

const ORIGIN = 'https://site.test';
const SECRET = 'a-test-secret-that-is-long-enough-0123456789';
const installer: Actor = { kind: 'cli', id: 'installer', role: 'owner' };
const everything = { publish: false, personalData: false, days: 30 };

let database: Database;
let auth: CmsAuth;

const bearer = (token: string, path = '/api/cms/session', init: RequestInit = {}) =>
  new Request(`${ORIGIN}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });

beforeEach(async () => {
  database = await openDatabase({ url: ':memory:' });
  auth = new CmsAuth({ db: database.db, secret: SECRET, origin: ORIGIN, siteName: 'Site', mailer: new MemoryMailer(), answerAfterMs: 0 });
});
afterEach(() => database.close());

describe('access tokens', () => {
  it('makes a token shown once, keeps only its hash, and lists it by name', async () => {
    const { token, secret } = await auth.createToken(installer, { name: 'Claude', role: 'editor', ...everything });
    expect(secret).toMatch(/^vcms_[A-Za-z0-9_-]{43}$/);
    expect(token).toMatchObject({ name: 'Claude', role: 'editor', hint: secret.slice(-4), publish: false, personalData: false, madeBy: null, lastUsedAt: null });
    const stored = await database.db.select().from(authToken);
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect((await auth.listTokens(installer)).map((one) => one.name)).toEqual(['Claude']);
  });

  it('lets a token act as an agent, with its role\'s writing and no more than it was allowed', async () => {
    const { secret } = await auth.createToken(installer, { name: 'Writer', role: 'editor', ...everything });
    const session = await auth.authenticate(bearer(secret));
    expect(session?.actor).toMatchObject({ kind: 'agent', role: 'editor' });
    expect(session?.actor.permissions).toEqual(expect.arrayContaining(['entry:read', 'entry:write', 'form:write']));
    expect(session?.actor.permissions).not.toEqual(expect.arrayContaining(['entry:publish']));
    expect(session?.actor.permissions).not.toContain('contact:read');
    expect(session?.actor.permissions).not.toContain('user:manage');

    const { secret: trusted } = await auth.createToken(installer, { name: 'Trusted', role: 'editor', ...everything, publish: true, personalData: true });
    expect((await auth.authenticate(bearer(trusted)))?.actor.permissions).toEqual(expect.arrayContaining(['entry:publish', 'contact:read', 'submission:read']));
  });

  it('refuses an owner\'s role, a name that says nothing and a life past a year', async () => {
    await expect(auth.createToken(installer, { name: 'All', role: 'owner', ...everything })).rejects.toThrow(/editor or author/);
    await expect(auth.createToken(installer, { name: ' ', role: 'editor', ...everything })).rejects.toThrow(/what the token is for/);
    await expect(auth.createToken(installer, { name: 'Long', role: 'editor', ...everything, days: 400 })).rejects.toThrow(/1 to 365 days/);
  });

  it('is for owners to make and take away', async () => {
    const editor: Actor = { kind: 'user', id: 'u2', role: 'editor' };
    await expect(auth.createToken(editor, { name: 'Mine', role: 'author', ...everything })).rejects.toThrow(/user:manage/);
    const { token, secret } = await auth.createToken(installer, { name: 'Gone soon', role: 'author', ...everything });
    await expect(auth.revokeToken(editor, token.id)).rejects.toThrow(/user:manage/);
    await auth.revokeToken(installer, token.id);
    expect(await auth.authenticate(bearer(secret))).toBeNull();
  });

  it('stops working when it ends, and when its maker is no longer an owner', async () => {
    const { token, secret } = await auth.createToken(installer, { name: 'Old', role: 'author', ...everything });
    await database.db.update(authToken).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await auth.authenticate(bearer(secret))).toBeNull();
    expect(await auth.listTokens(installer)).toEqual([]);
    expect(token.id).toBeTruthy();

    const person = await auth.invite(installer, { email: 'owner@example.com', name: 'Olive', role: 'owner' });
    const made = await auth.createToken({ kind: 'user', id: person.id, role: 'owner' }, { name: 'Olive\'s agent', role: 'editor', ...everything });
    expect(made.token.madeBy).toBe('Olive');
    expect(await auth.authenticate(bearer(made.secret))).not.toBeNull();
    await auth.invite(installer, { email: 'other@example.com', name: 'Otto', role: 'owner' });
    await auth.changeRole(installer, person.id, 'editor');
    expect(await auth.authenticate(bearer(made.secret))).toBeNull();
  });

  it('is judged alone: a bad token is refused, whatever cookie comes with it', async () => {
    expect(await auth.authenticate(bearer('vcms_not-a-real-token', '/api/cms/session', { headers: { cookie: 'better-auth.session_token=x' } }))).toBeNull();
  });

  it('works through the API, where a token cannot make another', async () => {
    const cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository() });
    const api = new CmsApi({ cms, authenticator: auth, people: auth, tokens: auth });
    const { secret } = await auth.createToken(installer, { name: 'Agent', role: 'editor', ...everything });
    const session = await (await api.handle(bearer(secret))).json();
    expect(session).toEqual({ user: expect.objectContaining({ name: 'Agent', role: 'editor' }) });
    const made = await api.handle(bearer(secret, '/api/cms/tokens', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'More', role: 'editor', publish: true, personalData: true, days: 1 }) }));
    expect(made.status).toBe(403);
    const listed = await api.handle(bearer(secret, '/api/cms/tokens'));
    expect(listed.status).toBe(403);
  });
});
