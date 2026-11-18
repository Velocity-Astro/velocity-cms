import { CmsApi } from '@velocity-astro/cms-api';
import { createCms, type Actor } from '@velocity-astro/cms-core';
import { InMemoryEntryRepository, InMemorySchemaRepository } from '@velocity-astro/cms-core/in-memory';
import { authSession, authUser, authVerification, openDatabase, type Database } from '@velocity-astro/cms-db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSetupError, CmsAuth } from './auth.js';
import { MemoryMailer } from './mailer.js';
import { AuthTeam } from './team.js';

const ORIGIN = 'https://site.test';
const SECRET = 'a-test-secret-that-is-long-enough-0123456789';
const owner: Actor = { kind: 'cli', id: 'installer', role: 'owner' };

let database: Database;
let mailer: MemoryMailer;
let auth: CmsAuth;

const make = (changes: Partial<ConstructorParameters<typeof CmsAuth>[0]> = {}) =>
  new CmsAuth({ db: database.db, secret: SECRET, origin: ORIGIN, siteName: 'Lakeshore Realty', mailer, answerAfterMs: 0, ...changes });

/** Asks for a sign-in link the way the sign-in screen does. */
const askForLink = (email: string) =>
  auth.handle(
    new Request(`${ORIGIN}/api/cms/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ email, callbackURL: '/admin' }),
    }),
  );
/** Opens a link as a browser would, and returns the cookies it was given and where it was sent. */
const open = async (url: string) => {
  const response = await auth.handle(new Request(url, { redirect: 'manual' }));
  const set = response.headers.getSetCookie();
  return { cookie: set.map((cookie) => cookie.split(';')[0]).join('; '), raw: set.join(' | ').toLowerCase(), location: response.headers.get('location') };
};
const withCookie = (cookie: string, path = '/api/cms/session', init: RequestInit = {}) =>
  new Request(`${ORIGIN}${path}`, { ...init, headers: { ...(cookie && { cookie }), ...init.headers } });

beforeEach(async () => {
  database = await openDatabase({ url: ':memory:' });
  mailer = new MemoryMailer();
  auth = make();
});
afterEach(() => database.close());

describe('inviting people', () => {
  it('lets an owner invite someone, and lists who can sign in', async () => {
    await auth.invite(owner, { email: ' Dana@Example.com ', name: 'Dana', role: 'editor' });
    await auth.invite(owner, { email: 'ben@example.com', name: 'Ben', role: 'author' });
    expect((await auth.listUsers(owner)).map(({ email, name, role }) => ({ email, name, role }))).toEqual([
      { email: 'ben@example.com', name: 'Ben', role: 'author' },
      { email: 'dana@example.com', name: 'Dana', role: 'editor' },
    ]);
    // An invitation points at the editor and carries nothing that signs anyone in.
    expect(mailer.sent).toEqual([]);
    expect(mailer.invitations).toEqual([
      { email: 'dana@example.com', name: 'Dana', url: 'https://site.test/admin', siteName: 'Lakeshore Realty' },
      { email: 'ben@example.com', name: 'Ben', url: 'https://site.test/admin', siteName: 'Lakeshore Realty' },
    ]);
  });

  it('adds nobody when the invitation cannot be sent, and says so', async () => {
    mailer.sendInvitation = () => Promise.reject(new Error('The provider said no.'));
    await expect(auth.invite(owner, { email: 'dana@example.com', name: 'Dana', role: 'editor' })).rejects.toMatchObject({
      code: 'conflict',
      message: expect.stringContaining('could not be sent, so nobody was added'),
    });
    expect(await auth.listUsers(owner)).toEqual([]);
  });

  it('says who is on the team by name and role, with no email', async () => {
    const dana = await auth.invite(owner, { email: 'dana@example.com', name: 'Dana', role: 'editor' });
    const ben = await auth.invite(owner, { email: 'ben@example.com', name: 'Ben', role: 'author' });
    expect(await new AuthTeam(database.db).members()).toEqual([
      { id: ben.id, name: 'Ben', role: 'author' },
      { id: dana.id, name: 'Dana', role: 'editor' },
    ]);
  });

  it('refuses anyone but an owner', async () => {
    const editor: Actor = { kind: 'user', id: 'u', role: 'editor' };
    await expect(auth.invite(editor, { email: 'x@example.com', name: 'X', role: 'owner' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(auth.listUsers(editor)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses an invitation that could not work, and one for someone already here', async () => {
    await expect(auth.invite(owner, { email: 'not-an-address', name: '', role: 'editor' })).rejects.toMatchObject({
      code: 'validation_failed',
      issues: [{ path: ['email'] }, { path: ['name'] }],
    });
    await expect(auth.invite(owner, { email: 'a@example.com', name: 'A', role: 'admin' as never })).rejects.toMatchObject({ issues: [{ path: ['role'] }] });
    await auth.invite(owner, { email: 'dana@example.com', name: 'Dana', role: 'editor' });
    await expect(auth.invite(owner, { email: 'DANA@example.com', name: 'Dana again', role: 'owner' })).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('changing and removing people', () => {
  it('changes a role, which the next request already sees', async () => {
    const dana = await auth.invite(owner, { email: 'dana@example.com', name: 'Dana', role: 'author' });
    const { cookie } = await open(await auth.createSignInLink('dana@example.com'));
    expect((await auth.authenticate(withCookie(cookie)))?.actor.role).toBe('author');
    expect(await auth.changeRole(owner, dana.id, 'editor')).toMatchObject({ id: dana.id, role: 'editor' });
    expect((await auth.authenticate(withCookie(cookie)))?.actor.role).toBe('editor');
    await expect(auth.changeRole(owner, dana.id, 'admin' as never)).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(auth.changeRole(owner, 'nobody', 'editor')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('removes a person, and signs them out everywhere at once', async () => {
    const dana = await auth.invite(owner, { email: 'dana@example.com', name: 'Dana', role: 'editor' });
    const { cookie } = await open(await auth.createSignInLink('dana@example.com'));
    expect(await auth.authenticate(withCookie(cookie))).not.toBeNull();
    await auth.remove(owner, dana.id);
    expect(await auth.authenticate(withCookie(cookie))).toBeNull();
    expect(await auth.listUsers(owner)).toEqual([]);
    await askForLink('dana@example.com');
    expect(mailer.sent).toEqual([]);
  });

  it('always leaves the site an owner, and nobody removes themselves', async () => {
    const first = await auth.invite(owner, { email: 'first@example.com', name: 'First', role: 'owner' });
    await expect(auth.changeRole(owner, first.id, 'editor')).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('only owner') });
    await expect(auth.remove(owner, first.id)).rejects.toMatchObject({ code: 'conflict' });
    const second = await auth.invite(owner, { email: 'second@example.com', name: 'Second', role: 'owner' });
    const asFirst: Actor = { kind: 'user', id: first.id, role: 'owner' };
    await expect(auth.remove(asFirst, first.id)).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('yourself') });
    await auth.remove(asFirst, second.id);
    expect((await auth.listUsers(owner)).map((user) => user.email)).toEqual(['first@example.com']);
  });

  it('refuses anyone but an owner', async () => {
    const dana = await auth.invite(owner, { email: 'dana@example.com', name: 'Dana', role: 'editor' });
    const editor: Actor = { kind: 'user', id: dana.id, role: 'editor' };
    await expect(auth.changeRole(editor, dana.id, 'owner')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(auth.remove(editor, dana.id)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('signing in by email link', () => {
  beforeEach(async () => {
    await auth.invite(owner, { email: 'dana@example.com', name: 'Dana', role: 'editor' });
  });

  it('emails an invited person a link that signs them in with their role', async () => {
    expect((await askForLink('dana@example.com')).status).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ email: 'dana@example.com', name: 'Dana', expiresInMinutes: 10, siteName: 'Lakeshore Realty' });
    expect(mailer.sent[0]?.url.startsWith(`${ORIGIN}/api/cms/auth/magic-link/verify?token=`)).toBe(true);

    const opened = await open(mailer.sent[0]?.url ?? '');
    expect(opened.location).toBe(`${ORIGIN}/admin`);
    const session = await auth.authenticate(withCookie(opened.cookie));
    expect(session).toMatchObject({ user: { email: 'dana@example.com', name: 'Dana' }, actor: { kind: 'user', role: 'editor' } });
    expect(session?.actor.id).toBe(session?.user.id);
  });

  it('shows someone as only invited until the first link they use', async () => {
    const invited = async () => (await auth.listUsers(owner)).map(({ name, hasSignedIn }) => ({ name, hasSignedIn }));
    expect(await invited()).toEqual([{ name: 'Dana', hasSignedIn: false }]);
    // Asking for a link is not signing in: anyone can type an address.
    await askForLink('dana@example.com');
    expect(await invited()).toEqual([{ name: 'Dana', hasSignedIn: false }]);
    await open(mailer.sent[0]?.url ?? '');
    expect(await invited()).toEqual([{ name: 'Dana', hasSignedIn: true }]);
  });

  it('sends a stranger nothing, and answers them the same way', async () => {
    const known = await askForLink('dana@example.com');
    const stranger = await askForLink('stranger@example.com');
    expect([stranger.status, await stranger.text()]).toEqual([known.status, await known.text()]);
    expect(mailer.sent.map((mail) => mail.email)).toEqual(['dana@example.com']);
    expect(await database.db.select().from(authUser)).toHaveLength(1);
  });

  it('emails one address three links in ten minutes and no more, and answers as before', async () => {
    const answers = [];
    for (let asked = 0; asked < 5; asked += 1) answers.push((await askForLink('Dana@example.com')).status);
    expect(answers).toEqual([200, 200, 200, 200, 200]);
    expect(mailer.sent).toHaveLength(3);
  });

  it('answers a known address like a stranger when the email cannot be sent', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mailer.sendSignInLink = () => Promise.reject(new Error('The mail service is down.'));
    const known = await askForLink('dana@example.com');
    const stranger = await askForLink('stranger@example.com');
    expect([known.status, await known.text()]).toEqual([stranger.status, await stranger.text()]);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it('takes as long to answer a stranger as someone invited', async () => {
    auth = make({ answerAfterMs: 120 });
    const timed = async (email: string) => {
      const started = Date.now();
      await askForLink(email);
      return Date.now() - started;
    };
    expect(await timed('stranger@example.com')).toBeGreaterThanOrEqual(115);
    expect(await timed('dana@example.com')).toBeGreaterThanOrEqual(115);
  });

  it('makes a link that works once, and keeps its token unreadable', async () => {
    await askForLink('dana@example.com');
    const url = mailer.sent[0]?.url ?? '';
    const token = new URL(url).searchParams.get('token') ?? '';
    expect(JSON.stringify(await database.db.select().from(authVerification))).not.toContain(token);

    const first = await open(url);
    expect(await auth.authenticate(withCookie(first.cookie))).not.toBeNull();
    const second = await open(url);
    expect(second.cookie === '' ? null : await auth.authenticate(withCookie(second.cookie))).toBeNull();
    expect(second.location).toContain('error=');
  });

  it('keeps the session in a cookie scripts cannot read and other sites cannot send', async () => {
    await askForLink('dana@example.com');
    const { raw } = await open(mailer.sent[0]?.url ?? '');
    expect(raw).toContain('httponly');
    expect(raw).toContain('samesite=lax');
    expect(raw).toContain('secure');
  });

  it('has no session without a cookie, with a made-up one, or after signing out', async () => {
    expect(await auth.authenticate(withCookie(''))).toBeNull();
    expect(await auth.authenticate(withCookie('__Secure-better-auth.session_token=made-up.signature'))).toBeNull();

    await askForLink('dana@example.com');
    const { cookie } = await open(mailer.sent[0]?.url ?? '');
    const out = await auth.handle(
      withCookie(cookie, '/api/cms/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: '{}' }),
    );
    expect(out.status).toBe(200);
    expect(await auth.authenticate(withCookie(cookie))).toBeNull();
    expect(await database.db.select().from(authSession)).toHaveLength(0);
  });

  it('does not let a signed-in person change their own role', async () => {
    await askForLink('dana@example.com');
    const { cookie } = await open(mailer.sent[0]?.url ?? '');
    await auth.handle(
      withCookie(cookie, '/api/cms/auth/update-user', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ role: 'owner' }) }),
    );
    expect((await auth.authenticate(withCookie(cookie)))?.actor.role).toBe('editor');
  });

  it('never sends a link that would carry the person to another site afterwards', async () => {
    for (const callbackURL of ['https://evil.test/collect', '//evil.test', '/\\evil.test']) {
      await auth.handle(
        new Request(`${ORIGIN}/api/cms/auth/sign-in/magic-link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: JSON.stringify({ email: 'dana@example.com', callbackURL }),
        }),
      );
    }
    expect(mailer.sent).toEqual([]);
  });

  it('has no way to sign up or to sign in with a password', async () => {
    const post = (path: string, body: unknown) =>
      auth.handle(new Request(`${ORIGIN}/api/cms/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) }));
    const signUp = await post('/sign-up/email', { email: 'new@example.com', password: 'correct horse battery', name: 'New' });
    const signIn = await post('/sign-in/email', { email: 'dana@example.com', password: 'correct horse battery' });
    expect(signUp.ok).toBe(false);
    expect(signIn.ok).toBe(false);
    expect(await database.db.select().from(authUser)).toHaveLength(1);
  });
});

describe('the first owner', () => {
  it('is created with a link that signs them in without any email', async () => {
    const { user, link } = await auth.createFirstOwner({ email: 'maya@example.com', name: 'Maya' });
    expect(user).toMatchObject({ email: 'maya@example.com', role: 'owner' });
    expect(mailer.sent).toEqual([]);
    const { cookie, location } = await open(link);
    expect(location).toBe(`${ORIGIN}/admin`);
    expect((await auth.authenticate(withCookie(cookie)))?.actor).toEqual({ kind: 'user', id: user.id, role: 'owner' });
  });

  it('cannot be created once anyone exists, so the link cannot take a site over', async () => {
    await auth.createFirstOwner({ email: 'maya@example.com', name: 'Maya' });
    await expect(auth.createFirstOwner({ email: 'mallory@example.com', name: 'Mallory' })).rejects.toMatchObject({ code: 'conflict' });
    expect(await auth.listUsers(owner)).toHaveLength(1);
  });

  it('makes a link only for someone who exists', async () => {
    await expect(auth.createSignInLink('nobody@example.com')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('with the API', () => {
  it('lets the API act as whoever is signed in, with their role', async () => {
    const cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository() });
    const api = new CmsApi({ cms, authenticator: auth });
    await cms.schema.create(owner, { key: 'posts', kind: 'collection', label: { en: 'Posts' }, fields: [] });
    await auth.invite(owner, { email: 'priya@example.com', name: 'Priya', role: 'author' });
    const { cookie } = await open(await auth.createSignInLink('priya@example.com'));

    expect((await api.handle(withCookie('', '/api/cms/content-types'))).status).toBe(401);
    expect(await (await api.handle(withCookie(cookie))).json()).toMatchObject({ user: { email: 'priya@example.com', name: 'Priya' } });

    const json = { 'content-type': 'application/json', origin: ORIGIN };
    const created = await api.handle(withCookie(cookie, '/api/cms/entries', { method: 'POST', headers: json, body: JSON.stringify({ type: 'posts', slug: 'hello', data: {} }) }));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    // An author may write, but not publish.
    const published = await api.handle(withCookie(cookie, `/api/cms/entries/${id}/publish`, { method: 'POST', headers: json, body: JSON.stringify({ expectedRevision: 1 }) }));
    expect(published.status).toBe(403);
  });
});

describe('setting up', () => {
  it('refuses a secret too short to be safe, and an origin that is not an address', () => {
    expect(() => make({ secret: 'short' })).toThrow(AuthSetupError);
    expect(() => make({ origin: 'example.com' })).toThrow(AuthSetupError);
  });

  it('mounts wherever the site puts it, and lands links on the editor\'s own address', async () => {
    auth = make({ basePath: '/cms/auth', adminPath: '/studio', linkLifetimeMinutes: 30 });
    const { link } = await auth.createFirstOwner({ email: 'maya@example.com', name: 'Maya' });
    expect(link.startsWith(`${ORIGIN}/cms/auth/magic-link/verify?token=`)).toBe(true);
    expect((await open(link)).location).toBe(`${ORIGIN}/studio`);
  });
});
