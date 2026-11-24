import { CmsApi } from '@velocity-astro/cms-api';
import { createCms, type Actor } from '@velocity-astro/cms-core';
import { InMemoryEntryRepository, InMemorySchemaRepository } from '@velocity-astro/cms-core/in-memory';
import { authApp, authConnection, authConnectionSecret, authUser, openDatabase, type Database } from '@velocity-astro/cms-db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CmsAuth } from './auth.js';
import { MemoryMailer } from './mailer.js';

const ORIGIN = 'https://site.test';
const SECRET = 'a-test-secret-that-is-long-enough-0123456789';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'a-verifier-that-is-long-enough-to-be-one-0123456789';

let database: Database;
let auth: CmsAuth;
let owner: Actor;

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const challengeOf = async (verifier: string) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

const get = (path: string) => auth.connect(new Request(`${ORIGIN}${path}`));
const post = (path: string, body: Record<string, unknown>, as: 'json' | 'form' = 'form') =>
  auth.connect(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'content-type': as === 'json' ? 'application/json' : 'application/x-www-form-urlencoded' },
      body: as === 'json' ? JSON.stringify(body) : new URLSearchParams(body as Record<string, string>).toString(),
    }),
  );
const json = async (response: Response | Promise<Response>) => (await (await response).json()) as Record<string, unknown>;

async function register(overrides: Record<string, unknown> = {}): Promise<string> {
  const made = await json(post('/api/cms/oauth/register', { client_name: 'Claude', redirect_uris: [CALLBACK], ...overrides }, 'json'));
  return String(made['client_id']);
}

async function queryFor(clientId: string, overrides: Record<string, string> = {}): Promise<string> {
  return new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, code_challenge: await challengeOf(VERIFIER), code_challenge_method: 'S256', state: 'xyz', ...overrides }).toString();
}

/** Registers an app, has the owner allow it and trades the code: what an app holds once it is connected. */
async function connect(allowed: { publish?: boolean; personalData?: boolean } = {}) {
  const clientId = await register();
  const { redirect } = await auth.answer(owner, await queryFor(clientId), { allow: true, role: 'editor', publish: allowed.publish ?? false, personalData: allowed.personalData ?? false });
  const code = new URL(redirect).searchParams.get('code') ?? '';
  const tokens = await json(post('/api/cms/oauth/token', { grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: CALLBACK, code_verifier: VERIFIER }));
  return { clientId, code, redirect, access: String(tokens['access_token']), refresh: String(tokens['refresh_token']), tokens };
}

const bearer = (token: string, path = '/api/cms/session', init: RequestInit = {}) => new Request(`${ORIGIN}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });

beforeEach(async () => {
  database = await openDatabase({ url: ':memory:' });
  auth = new CmsAuth({ db: database.db, secret: SECRET, origin: ORIGIN, siteName: 'Site', mailer: new MemoryMailer(), answerAfterMs: 0 });
  const { user } = await auth.createFirstOwner({ email: 'dana@site.test', name: 'Dana' });
  owner = { kind: 'user', id: user.id, role: 'owner' };
});
afterEach(() => {
  vi.useRealTimers();
  database.close();
});

describe('how an app finds its way', () => {
  it('says where to sign in, for the configured site and never the request\'s host', async () => {
    const resource = await json(auth.connect(new Request('https://evil.test/.well-known/oauth-protected-resource/api/cms/mcp')));
    expect(resource).toMatchObject({ resource: `${ORIGIN}/api/cms/mcp`, authorization_servers: [ORIGIN] });
    expect(await json(get('/.well-known/oauth-protected-resource'))).toEqual(resource);
    const server = await json(get('/.well-known/oauth-authorization-server'));
    expect(server).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/api/cms/oauth/authorize`,
      token_endpoint: `${ORIGIN}/api/cms/oauth/token`,
      registration_endpoint: `${ORIGIN}/api/cms/oauth/register`,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
    expect(auth.resourceMetadata).toBe(`${ORIGIN}/.well-known/oauth-protected-resource/api/cms/mcp`);
  });

  it('is told where to look when the MCP server refuses it, and only there', async () => {
    const cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository() });
    const api = new CmsApi({ cms, authenticator: auth, tokens: auth, connections: auth });
    const call = (path: string, token?: string) =>
      api.handle(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token !== undefined && { authorization: `Bearer ${token}` }) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }));
    const refused = await call('/api/cms/mcp');
    expect(refused.status).toBe(401);
    expect(refused.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/cms/mcp"`);
    expect((await call('/api/cms/mcp', 'vcms_app_not-a-token')).headers.get('www-authenticate')).toContain('resource_metadata');

    const { access } = await connect();
    const answered = await call('/api/cms/mcp', access);
    expect(answered.status).toBe(200);
    expect(JSON.stringify(await answered.json())).toContain('describe_site');
  });
});

describe('registering', () => {
  it('gives an app an id, and takes its name as words only', async () => {
    const made = await json(post('/api/cms/oauth/register', { client_name: '<b>Claude</b>\n on a\tlaptop', redirect_uris: [CALLBACK, 'http://localhost:3334/callback', 'cursor://anysphere.cursor-mcp/oauth/callback'] }, 'json'));
    expect(made).toMatchObject({ client_name: 'b Claude /b on a laptop', token_endpoint_auth_method: 'none', redirect_uris: [CALLBACK, 'http://localhost:3334/callback', 'cursor://anysphere.cursor-mcp/oauth/callback'] });
    expect(made['client_id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(made['client_secret']).toBeUndefined();
  });

  it('refuses an address a browser would run, one over plain http, and one with a password in it', async () => {
    for (const uri of ['javascript:alert(1)', 'http://example.com/callback', 'https://user:pass@example.com/', 'data:text/html,hello', 'not an address', 'https://example.com/#here']) {
      const response = await post('/api/cms/oauth/register', { client_name: 'App', redirect_uris: [uri] }, 'json');
      expect([uri, response.status, (await json(response))['error']]).toEqual([uri, 400, 'invalid_redirect_uri']);
    }
    expect((await post('/api/cms/oauth/register', { client_name: 'App' }, 'json')).status).toBe(400);
  });

  it('takes only so many in ten minutes, and forgets an app nobody approved', async () => {
    for (let made = 0; made < 30; made++) await register();
    const refused = await post('/api/cms/oauth/register', { client_name: 'One more', redirect_uris: [CALLBACK] }, 'json');
    expect(refused.status).toBe(429);

    const approved = await connect().catch(() => null);
    expect(approved).toBeNull();
    const [kept] = await database.db.select().from(authApp).limit(1);
    await auth.answer(owner, await queryFor(kept?.id ?? ''), { allow: true, role: 'author', publish: false, personalData: false });
    vi.useFakeTimers({ now: Date.now() + 8 * 24 * 60 * 60_000, toFake: ['Date'] });
    await register();
    const left = await database.db.select().from(authApp);
    expect(left).toHaveLength(2);
    expect(left.map((app) => app.id)).toContain(kept?.id);
  });
});

describe('asking the person', () => {
  it('sends the person to the editor with what the app asked', async () => {
    const clientId = await register();
    const query = await queryFor(clientId);
    const response = await get(`/api/cms/oauth/authorize?${query}`);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/admin/connect?${query}`);
    expect(await auth.asked(owner, query)).toEqual({ appName: 'Claude', returnsTo: 'claude.ai', isLocal: false });
  });

  it('sends nobody to an address the app did not register', async () => {
    const clientId = await register();
    const elsewhere = await get(`/api/cms/oauth/authorize?${await queryFor(clientId, { redirect_uri: 'https://evil.test/callback' })}`);
    expect(elsewhere.status).toBe(400);
    expect(elsewhere.headers.get('location')).toBeNull();
    expect(elsewhere.headers.get('content-type')).toContain('text/plain');
    const unknown = await get(`/api/cms/oauth/authorize?${await queryFor('nobody')}`);
    expect(unknown.status).toBe(400);
    await expect(auth.asked(owner, await queryFor(clientId, { redirect_uri: 'https://evil.test/callback' }))).rejects.toThrow(/did not register/);
    await expect(auth.answer(owner, await queryFor('nobody'), { allow: true, role: 'editor', publish: true, personalData: true })).rejects.toThrow(/does not know the app/);
  });

  it('lets an app on this computer come back on whichever port it listens on', async () => {
    const clientId = await register({ redirect_uris: ['http://localhost:1234/callback'] });
    const query = await queryFor(clientId, { redirect_uri: 'http://localhost:53712/callback' });
    expect(await auth.asked(owner, query)).toEqual({ appName: 'Claude', returnsTo: 'localhost', isLocal: true });
    await expect(auth.asked(owner, await queryFor(clientId, { redirect_uri: 'http://localhost:53712/other' }))).rejects.toThrow(/did not register/);
  });

  it('tells the app, not the person, when it asked without PKCE or for something else', async () => {
    const clientId = await register();
    const plain = await get(`/api/cms/oauth/authorize?${await queryFor(clientId, { code_challenge_method: 'plain' })}`);
    const back = new URL(plain.headers.get('location') ?? '');
    expect(back.origin + back.pathname).toBe(CALLBACK);
    expect(Object.fromEntries(back.searchParams)).toMatchObject({ error: 'invalid_request', state: 'xyz' });
    const other = await get(`/api/cms/oauth/authorize?${await queryFor(clientId, { resource: 'https://other.test/mcp' })}`);
    expect(new URL(other.headers.get('location') ?? '').searchParams.get('error')).toBe('invalid_target');
  });

  it('is an owner\'s to answer, signed in to the editor', async () => {
    const query = await queryFor(await register());
    const editor: Actor = { kind: 'user', id: 'u2', role: 'editor' };
    await expect(auth.asked(editor, query)).rejects.toThrow(/Only an owner/);
    await expect(auth.answer(editor, query, { allow: true, role: 'author', publish: false, personalData: false })).rejects.toThrow(/Only an owner/);
    await expect(auth.answer({ kind: 'cli', id: 'installer', role: 'owner' }, query, { allow: true, role: 'author', publish: false, personalData: false })).rejects.toThrow(/signed in/);
    await expect(auth.answer(owner, query, { allow: true, role: 'owner', publish: true, personalData: true })).rejects.toThrow(/editor or author/);
    expect(await database.db.select().from(authConnection)).toHaveLength(0);
  });

  it('tells the app when the person said no, and connects nothing', async () => {
    const { redirect } = await auth.answer(owner, await queryFor(await register()), { allow: false });
    expect(Object.fromEntries(new URL(redirect).searchParams)).toMatchObject({ error: 'access_denied', state: 'xyz', iss: ORIGIN });
    expect(await auth.listConnections(owner)).toEqual([]);
  });
});

describe('a connected app', () => {
  it('acts as an agent with what the person allowed and no more', async () => {
    const { access, tokens, redirect } = await connect();
    expect(Object.fromEntries(new URL(redirect).searchParams)).toMatchObject({ state: 'xyz', iss: ORIGIN });
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'content' });
    expect(access).toMatch(/^vcms_app_[A-Za-z0-9_-]{43}$/);
    const session = await auth.authenticate(bearer(access));
    expect(session).toMatchObject({ user: { name: 'Claude' }, actor: { kind: 'agent', role: 'editor' } });
    expect(session?.actor.permissions).toEqual(expect.arrayContaining(['entry:read', 'entry:write']));
    expect(session?.actor.permissions).not.toEqual(expect.arrayContaining(['entry:publish']));
    expect(session?.actor.permissions).not.toContain('contact:read');
    expect(session?.actor.permissions).not.toContain('user:manage');

    const trusted = await connect({ publish: true, personalData: true });
    expect(trusted.tokens['scope']).toBe('content publish personal_data');
    expect((await auth.authenticate(bearer(trusted.access)))?.actor.permissions).toEqual(expect.arrayContaining(['entry:publish', 'contact:read']));
  });

  it('keeps only hashes', async () => {
    const { access, refresh, code } = await connect();
    const stored = JSON.stringify(await database.db.select().from(authConnectionSecret));
    for (const secret of [access, refresh, code]) expect(stored).not.toContain(secret);
  });

  it('trades a code once, with the verifier, as the app it was given to', async () => {
    const clientId = await register();
    const other = await register();
    const allowed = async () => new URL((await auth.answer(owner, await queryFor(clientId), { allow: true, role: 'editor', publish: false, personalData: false })).redirect).searchParams.get('code') ?? '';
    const trade = (code: string, changes: Record<string, string> = {}) => post('/api/cms/oauth/token', { grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: CALLBACK, code_verifier: VERIFIER, ...changes });

    expect(await json(trade(await allowed(), { code_verifier: 'another-verifier-that-is-long-enough-0123456789' }))).toMatchObject({ error: 'invalid_grant' });
    expect(await json(trade(await allowed(), { client_id: other }))).toMatchObject({ error: 'invalid_client' });
    expect(await json(trade(await allowed(), { redirect_uri: 'https://evil.test/' }))).toMatchObject({ error: 'invalid_grant' });
    expect((await trade('vcms_code_nothing')).status).toBe(400);

    const code = await allowed();
    const first = await json(trade(code));
    expect(first['access_token']).toBeDefined();
    // A second use means someone else holds the code: the connection ends for both.
    expect(await json(trade(code))).toMatchObject({ error: 'invalid_grant' });
    expect(await auth.authenticate(bearer(String(first['access_token'])))).toBeNull();
  });

  it('gets its next tokens by itself, each renewing token once', async () => {
    const { clientId, access, refresh } = await connect();
    const renew = (token: string) => post('/api/cms/oauth/token', { grant_type: 'refresh_token', refresh_token: token, client_id: clientId });
    const next = await json(renew(refresh));
    expect(next).toMatchObject({ token_type: 'Bearer', scope: 'content' });
    expect(next['refresh_token']).not.toBe(refresh);
    expect(await auth.authenticate(bearer(String(next['access_token'])))).not.toBeNull();
    // An answer lost on the way: the same token works again for a moment.
    expect((await json(renew(refresh)))['access_token']).toBeDefined();

    // An hour on, the first token has ended and the app renews.
    vi.useFakeTimers({ now: Date.now() + 61 * 60_000, toFake: ['Date'] });
    expect(await auth.authenticate(bearer(access))).toBeNull();
    const later = await json(renew(String(next['refresh_token'])));
    expect(await auth.authenticate(bearer(String(later['access_token'])))).not.toBeNull();
    // The first renewing token, used long ago, used again: a copy is out. Everything stops.
    expect(await json(renew(refresh))).toMatchObject({ error: 'invalid_grant' });
    expect(await auth.authenticate(bearer(String(later['access_token'])))).toBeNull();
    expect(await auth.listConnections(owner)).toEqual([]);
  });

  it('is listed for owners, and stops at once when it is taken away', async () => {
    const { access, refresh, clientId } = await connect({ publish: true });
    const [listed] = await auth.listConnections(owner);
    expect(listed).toMatchObject({ name: 'Claude', returnsTo: 'claude.ai', role: 'editor', publish: true, personalData: false, connectedBy: 'Dana' });
    await expect(auth.listConnections({ kind: 'user', id: 'u2', role: 'editor' })).rejects.toThrow(/user:manage/);
    await expect(auth.disconnect({ kind: 'user', id: 'u2', role: 'editor' }, listed?.id ?? '')).rejects.toThrow(/user:manage/);

    await auth.disconnect(owner, listed?.id ?? '');
    expect(await auth.authenticate(bearer(access))).toBeNull();
    expect(await json(post('/api/cms/oauth/token', { grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId }))).toMatchObject({ error: 'invalid_grant' });
    expect(await database.db.select().from(authConnectionSecret)).toHaveLength(0);
    await expect(auth.disconnect(owner, listed?.id ?? '')).rejects.toThrow(/not found/);
  });

  it('stops when whoever connected it is no longer an owner', async () => {
    const { access, refresh, clientId } = await connect();
    await database.db.update(authUser).set({ role: 'editor' }).where(eq(authUser.id, owner.id));
    expect(await auth.authenticate(bearer(access))).toBeNull();
    expect(await json(post('/api/cms/oauth/token', { grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId }))).toMatchObject({ error: 'invalid_grant' });
  });

  it('stops when the app gives its token up', async () => {
    const { access, refresh } = await connect();
    expect((await post('/api/cms/oauth/revoke', { token: 'vcms_renew_unknown' })).status).toBe(200);
    expect(await auth.authenticate(bearer(access))).not.toBeNull();
    expect((await post('/api/cms/oauth/revoke', { token: refresh })).status).toBe(200);
    expect(await auth.authenticate(bearer(access))).toBeNull();
  });

  it('replaces the same person\'s earlier connection of the same app', async () => {
    const clientId = await register();
    const allow = async () => auth.answer(owner, await queryFor(clientId), { allow: true, role: 'editor', publish: false, personalData: false });
    await allow();
    await allow();
    expect(await auth.listConnections(owner)).toHaveLength(1);
  });

  it('leaves access tokens made by hand working', async () => {
    const { secret } = await auth.createToken(owner, { name: 'Script', role: 'editor', publish: false, personalData: false, days: 30 });
    expect((await auth.authenticate(bearer(secret)))?.actor).toMatchObject({ kind: 'agent', role: 'editor' });
  });

  it('refuses a body that is too large, and a grant it does not know', async () => {
    expect((await post('/api/cms/oauth/token', { grant_type: 'authorization_code', code: 'x'.repeat(30_000) })).status).toBe(413);
    expect(await json(post('/api/cms/oauth/token', { grant_type: 'password' }))).toMatchObject({ error: 'unsupported_grant_type' });
    expect((await get('/api/cms/oauth/token')).status).toBe(405);
  });
});
