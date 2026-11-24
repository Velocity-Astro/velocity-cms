import { passkey } from '@better-auth/passkey';
import type { AccessToken, ApiSession, AskedConnection, Authenticator, ConnectedApp, ConnectionAnswer, Connections, MadeAccessToken, NewAccessToken, Profile, ProfileChanges, Profiles, Tokens } from '@velocity-astro/cms-api';
import { AccessControl, CmsError, ConflictError, ForbiddenError, NotFoundError, ROLES, ValidationError, readImage, type Actor, type Role } from '@velocity-astro/cms-core';
import { authAccount, authPasskey, authSession, authUser, authVerification, type Db } from '@velocity-astro/cms-db';
import { betterAuth } from 'better-auth';
import { and, eq, like, lt } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { AppConnections, appToken } from './connections.js';
import type { Mailer } from './mailer.js';
import { AccessTokens, bearerToken } from './tokens.js';

/** Someone who can sign in to the editor. */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
  /** Whether they have ever signed in. Until then they were only invited. */
  readonly hasSignedIn: boolean;
}

export interface Invitation {
  readonly email: string;
  readonly name: string;
  readonly role: Role;
}

export interface CmsAuthOptions {
  /** The CMS database, opened with `openDatabase` from `cms-db`. Sign-in keeps its tables there. */
  readonly db: Db;
  /** Signs sessions and links. At least 32 characters, random, and never committed. */
  readonly secret: string;
  /** The site's own address, such as `https://example.com`. Passkeys are tied to its host name. */
  readonly origin: string;
  /** Shown in emails and in the browser's passkey prompt. */
  readonly siteName: string;
  readonly mailer: Mailer;
  /** Where sign-in is mounted. Defaults to `/api/cms/auth`. */
  readonly basePath?: string;
  /** Where the editor is mounted, which is where a sign-in link lands. Defaults to `/admin`. */
  readonly adminPath?: string;
  /** Where the API is mounted, which is where an app that connects by itself finds the MCP server. Defaults to `/api/cms`. */
  readonly apiPath?: string;
  /** Told about a fault while an app connects, which the app is told nothing about. */
  readonly onFault?: (error: unknown) => void;
  /** How long a sign-in link works for. Defaults to 10 minutes. */
  readonly linkLifetimeMinutes?: number;
  /**
   * The least time a request for a sign-in link takes to answer, whoever the address belongs to.
   * Defaults to one second, which is longer than an email usually takes to hand over.
   */
  readonly answerAfterMs?: number;
  /** Decides who may invite people. Defaults to the CMS's own rules; pass `cms.access` to share them. */
  readonly access?: AccessControl;
}

/** The sign-in settings are wrong in a way that would leave the site unsafe or unreachable. */
export class AuthSetupError extends CmsError {
  readonly code = 'auth_setup';
}

/** How many sign-in links one address is emailed in any ten minutes. More are asked for in vain. */
const LINKS_PER_ADDRESS = 3;
const LINKS_WINDOW_MS = 10 * 60_000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The longest name a person can be given: it goes in emails and across the editor. */
const MAX_NAME_LENGTH = 80;
/** A photo is drawn small, so it is kept small: the editor makes it 256 pixels square. */
const MAX_PHOTO_BYTES = 96 * 1024;
const PHOTO = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
/** How long a link that confirms a new address works for. */
const EMAIL_CHANGE_MINUTES = 30;
const EMAIL_CHANGE = 'velocity-email-change:';

const sha256 = async (text: string) =>
  [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** A person's name as it is kept: words on one line. Refused when empty, too long or not plain words. */
function nameFrom(typed: string): string {
  const name = typed.trim().replace(/\s+/g, ' ');
  const problem =
    name === '' ? 'Enter a name.' : name.length > MAX_NAME_LENGTH ? `Keep the name to ${MAX_NAME_LENGTH} characters.` : /[\p{Cc}<>]/u.test(name) ? 'Use plain words for the name, without angle brackets.' : null;
  if (problem !== null) throw new ValidationError(problem, [{ path: ['name'], message: problem }]);
  return name;
}

/** A photo as it is kept: a small PNG, JPEG or WebP in a `data:` address, checked by what it holds. */
function photoFrom(typed: string): string {
  const match = PHOTO.exec(typed);
  const bytes = match?.[2] === undefined ? null : Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  const facts = bytes === null ? null : readImage(bytes);
  const problem =
    bytes === null || facts === null || facts.contentType !== `image/${match?.[1] ?? ''}`
      ? 'Choose a photo that is a JPEG, PNG or WebP.'
      : bytes.length > MAX_PHOTO_BYTES
        ? 'That photo is too large. Choose a smaller one.'
        : null;
  if (problem !== null) throw new ValidationError(problem, [{ path: ['image'], message: problem }]);
  return typed;
}
const isRole = (value: unknown): value is Role => ROLES.includes(value as Role);
const normalised = (email: string) => email.trim().toLowerCase();

/** Whether everywhere a sign-in link can send the person afterwards is a path on this site. */
function staysOnSite(link: string): boolean {
  const { searchParams } = new URL(link);
  return ['callbackURL', 'newUserCallbackURL', 'errorCallbackURL'].every((name) => {
    const target = searchParams.get(name);
    // `//host` and `/\host` look like paths and are read by browsers as other sites.
    return target === null || /^\/(?![/\\])/.test(target);
  });
}

/**
 * Sign-in for the CMS: email links and passkeys, kept in the CMS's own database. There are no
 * passwords, and nobody can create their own account: people are invited.
 *
 * This class is the only place that knows which library does the work (Better Auth). The rest
 * of the CMS sees an `Authenticator` for the API, `handle` to mount, and a few methods for
 * managing who has access.
 */
export class CmsAuth implements Authenticator, Tokens, Connections, Profiles {
  readonly #options: CmsAuthOptions;
  readonly #access: AccessControl;
  readonly #adminPath: string;
  readonly #origin: string;
  readonly #lifetime: number;
  readonly #auth;
  readonly #tokens: AccessTokens;
  readonly #connections: AppConnections;
  /** Links being made for `createSignInLink`, by email: they are handed back instead of emailed. */
  readonly #handBack = new Map<string, (url: string) => void>();
  /** When links were last emailed, by address. */
  readonly #emailed = new Map<string, number[]>();

  constructor(options: CmsAuthOptions) {
    if (options.secret.length < 32) {
      throw new AuthSetupError('The sign-in secret is too short. Use at least 32 random characters, for example from `openssl rand -base64 32`.');
    }
    let origin: URL;
    try {
      origin = new URL(options.origin);
    } catch {
      throw new AuthSetupError(`"${options.origin}" is not an address. Give the site's own, such as https://example.com.`);
    }

    this.#options = options;
    this.#access = options.access ?? new AccessControl();
    this.#adminPath = options.adminPath ?? '/admin';
    this.#origin = origin.origin;
    this.#lifetime = options.linkLifetimeMinutes ?? 10;
    this.#tokens = new AccessTokens(options.db, this.#access);
    this.#connections = new AppConnections(options.db, {
      origin: origin.origin,
      access: this.#access,
      adminPath: this.#adminPath,
      ...(options.apiPath !== undefined && { apiPath: options.apiPath }),
      ...(options.onFault && { onFault: options.onFault }),
    });

    this.#auth = betterAuth({
      baseURL: origin.origin,
      basePath: options.basePath ?? '/api/cms/auth',
      secret: options.secret,
      database: drizzleAdapter(options.db, {
        provider: 'sqlite',
        schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification, passkey: authPasskey },
      }),
      // The CMS role lives on the person. `input: false` means no sign-in request can set it.
      user: { additionalFields: { role: { type: 'string', required: true, defaultValue: 'author', input: false } } },
      telemetry: { enabled: false },
      plugins: [
        magicLink({
          // Only people who were invited can sign in. A stranger's address creates nothing.
          disableSignUp: true,
          storeToken: 'hashed',
          expiresIn: this.#lifetime * 60,
          sendMagicLink: ({ email, url }) => this.#deliver(email, url),
        }),
        passkey({ rpID: origin.hostname, rpName: options.siteName, origin: origin.origin }),
      ],
    });
  }

  /** Answers a request to one of the sign-in addresses under `basePath`. Mount it there. */
  readonly handle = (request: Request): Promise<Response> => this.#auth.handler(request);

  /**
   * Who a request comes from: by the access token it carries (`Authorization: Bearer vcms_…`),
   * or else by its session cookie. This is what `CmsApi` asks. A request that carries a token is
   * judged by the token alone, so a bad one is refused rather than passed to the cookie.
   */
  async authenticate(request: Request): Promise<ApiSession | null> {
    if (appToken(request) !== null) return this.#connections.authenticate(request);
    if (bearerToken(request) !== null) return this.#tokens.authenticate(request);
    const session = await this.#auth.api.getSession({ headers: request.headers });
    if (!session) return null;
    const { id, email, name, role, image } = session.user;
    // A role this version does not know grants nothing, rather than something by accident.
    if (!isRole(role)) return null;
    return { user: { id, email, name, ...(typeof image === 'string' && image !== '' && { image }) }, actor: { kind: 'user', id, role } };
  }

  /**
   * Answers a request to an app's own side of connecting (OAuth): the addresses it finds its way
   * by, registering, and trading a code for tokens. Mount it at `/.well-known/oauth-*` and under
   * `<api>/oauth/`. `connects` says whether an address is one of them.
   */
  readonly connect = (request: Request): Promise<Response> => this.#connections.handle(request);

  connects(pathname: string): boolean {
    return this.#connections.handles(pathname);
  }

  /** Where a request to the MCP server with no session is told to look to learn how to sign in. */
  get resourceMetadata(): string {
    return this.#connections.resourceMetadata;
  }

  /** What an app asked for, read from the query its request carried. Owners only. */
  asked(actor: Actor, query: string): Promise<AskedConnection> {
    return this.#connections.asked(actor, query);
  }

  /** Records an owner's answer to an app, and says where their browser goes next. */
  answer(actor: Actor, query: string, answer: ConnectionAnswer): Promise<{ readonly redirect: string }> {
    return this.#connections.answer(actor, query, answer);
  }

  /** The apps connected to the site, newest first. Owners only. */
  listConnections(actor: Actor): Promise<ConnectedApp[]> {
    return this.#connections.listConnections(actor);
  }

  /** Takes a connected app away, at once. Owners only. */
  disconnect(actor: Actor, id: string): Promise<void> {
    return this.#connections.disconnect(actor, id);
  }

  /** The access tokens that have not ended, newest first. Owners only. */
  listTokens(actor: Actor): Promise<AccessToken[]> {
    return this.#tokens.listTokens(actor);
  }

  /** Makes an access token for an agent or a script. The token is in the answer and nowhere else. Owners only. */
  createToken(actor: Actor, token: NewAccessToken): Promise<MadeAccessToken> {
    return this.#tokens.createToken(actor, token);
  }

  /** Takes an access token away, at once. Owners only. */
  revokeToken(actor: Actor, id: string): Promise<void> {
    return this.#tokens.revokeToken(actor, id);
  }

  /** Everyone who can sign in, by name. */
  async listUsers(actor: Actor): Promise<AuthUser[]> {
    this.#access.require(actor, 'user:manage');
    const rows = await this.#options.db.select().from(authUser);
    return rows
      .map(({ id, email, name, role, emailVerified }) => ({ id, email, name, role: isRole(role) ? role : 'author', hasSignedIn: emailVerified }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
  }

  /**
   * Lets someone in and tells them so by email. The email carries no link that signs them in:
   * it points at the editor, where they ask for one, so an invitation read by someone else, or
   * weeks later, opens nothing. If it cannot be sent, nobody is added and the owner is told.
   */
  async invite(actor: Actor, invitation: Invitation): Promise<AuthUser> {
    this.#access.require(actor, 'user:manage');
    const user = await this.#create(invitation);
    const invitedBy = actor.kind === 'user' ? await this.#get(actor.id).then((inviter) => inviter.name).catch(() => undefined) : undefined;
    try {
      await this.#options.mailer.sendInvitation({
        email: user.email,
        name: user.name,
        url: `${this.#origin}${this.#adminPath}`,
        siteName: this.#options.siteName,
        ...(invitedBy !== undefined && { invitedBy }),
      });
    } catch (error) {
      await this.#options.db.delete(authUser).where(eq(authUser.id, user.id));
      console.error('[velocity-cms] An invitation could not be sent.', error);
      throw new ConflictError(`The invitation to ${user.email} could not be sent, so nobody was added. Check the site's email settings and try again.`);
    }
    return user;
  }

  /**
   * Changes what someone may do. It takes effect on their next request. A site always keeps an
   * owner, so the last one cannot be made anything less.
   */
  async changeRole(actor: Actor, userId: string, role: Role): Promise<AuthUser> {
    this.#access.require(actor, 'user:manage');
    if (!isRole(role)) throw new ValidationError(`Choose a role: ${ROLES.join(', ')}.`, [{ path: ['role'], message: `Choose a role: ${ROLES.join(', ')}.` }]);
    const user = await this.#get(userId);
    if (user.role === 'owner' && role !== 'owner') await this.#requireAnotherOwner(userId, 'Make someone else an owner first.');
    await this.#options.db.update(authUser).set({ role }).where(eq(authUser.id, userId));
    return { ...user, role };
  }

  /** Changes what someone is called. Owners only: everyone else changes their own on their profile. */
  async rename(actor: Actor, userId: string, name: string): Promise<AuthUser> {
    this.#access.require(actor, 'user:manage');
    const user = await this.#get(userId);
    const kept = nameFrom(name);
    await this.#options.db.update(authUser).set({ name: kept, updatedAt: new Date() }).where(eq(authUser.id, userId));
    return { ...user, name: kept };
  }

  /** The signed-in person's own details. */
  async profile(actor: Actor): Promise<Profile> {
    return this.#profileOf(this.#self(actor));
  }

  /** Changes the signed-in person's own name or photo. */
  async updateProfile(actor: Actor, changes: ProfileChanges): Promise<Profile> {
    const id = this.#self(actor);
    const name = changes.name === undefined ? undefined : nameFrom(changes.name);
    const image = changes.image === undefined ? undefined : changes.image === null ? null : photoFrom(changes.image);
    if (name !== undefined || image !== undefined) {
      await this.#options.db
        .update(authUser)
        .set({ ...(name !== undefined && { name }), ...(image !== undefined && { image }), updatedAt: new Date() })
        .where(eq(authUser.id, id));
    }
    return this.#profileOf(id);
  }

  /**
   * Emails a link to a new address. The address becomes the person's only when the link is
   * opened in the editor by the same person, signed in, within half an hour: a typing mistake
   * locks nobody out, and nobody takes an address they cannot read.
   */
  async askEmailChange(actor: Actor, email: string): Promise<void> {
    const id = this.#self(actor);
    const address = normalised(email);
    if (!EMAIL.test(address)) throw new ValidationError('Enter an email address, such as name@example.com.', [{ path: ['email'], message: 'Enter an email address, such as name@example.com.' }]);
    const user = await this.#get(id);
    if (address === user.email) throw new ValidationError('That is already your address.', [{ path: ['email'], message: 'That is already your address.' }]);
    if (await this.#find(address)) throw new ConflictError('Someone on this site already signs in with that address. Choose another.');
    const send = this.#options.mailer.sendEmailChange?.bind(this.#options.mailer);
    if (!send) throw new ConflictError('This site\'s email cannot send the link that confirms a new address. Ask whoever runs the site.');
    if (!this.#mayEmail(address)) throw new ConflictError('Several links were sent to that address just now. Wait ten minutes and try again.');

    const token = btoa(String.fromCharCode(...globalThis.crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const now = Date.now();
    // Links asked for before, and ones that ended, go: only the latest works.
    await this.#options.db.delete(authVerification).where(and(like(authVerification.identifier, `${EMAIL_CHANGE}%`), lt(authVerification.expiresAt, new Date(now))));
    for (const row of await this.#options.db.select().from(authVerification).where(like(authVerification.identifier, `${EMAIL_CHANGE}%`))) {
      if (this.#changeOf(row.value)?.user === id) await this.#options.db.delete(authVerification).where(eq(authVerification.id, row.id));
    }
    await this.#options.db.insert(authVerification).values({
      id: globalThis.crypto.randomUUID(),
      identifier: `${EMAIL_CHANGE}${await sha256(token)}`,
      value: JSON.stringify({ user: id, email: address }),
      expiresAt: new Date(now + EMAIL_CHANGE_MINUTES * 60_000),
    });
    try {
      await send({ email: address, name: user.name, url: `${this.#origin}${this.#adminPath}/profile?email=${token}`, expiresInMinutes: EMAIL_CHANGE_MINUTES, siteName: this.#options.siteName });
    } catch (error) {
      console.error('[velocity-cms] A link to confirm an email address could not be sent.', error);
      throw new ConflictError('The link could not be sent. Check the address, or try again in a moment.');
    }
  }

  /** Makes the address a link was sent to the person's own. The link works once. */
  async confirmEmailChange(actor: Actor, token: string): Promise<Profile> {
    const id = this.#self(actor);
    const identifier = `${EMAIL_CHANGE}${await sha256(token)}`;
    const [row] = await this.#options.db.select().from(authVerification).where(eq(authVerification.identifier, identifier)).limit(1);
    const change = row ? this.#changeOf(row.value) : null;
    if (!row || !change || change.user !== id || row.expiresAt.getTime() < Date.now()) {
      throw new ConflictError('This link has ended, or it was for someone else. Ask for a new one on your profile.');
    }
    await this.#options.db.delete(authVerification).where(eq(authVerification.id, row.id));
    if (await this.#find(change.email)) throw new ConflictError('Someone on this site signs in with that address now. Choose another.');
    await this.#options.db.update(authUser).set({ email: change.email, emailVerified: true, updatedAt: new Date() }).where(eq(authUser.id, id));
    return this.#profileOf(id);
  }

  /** The id of the person a request is from. An access token has no profile. */
  #self(actor: Actor): string {
    if (actor.kind !== 'user') throw new ForbiddenError('Only a person signed in has a profile.');
    return actor.id;
  }

  async #profileOf(id: string): Promise<Profile> {
    const [user] = await this.#options.db.select().from(authUser).where(eq(authUser.id, id)).limit(1);
    if (!user) throw new NotFoundError('Person', id);
    return { id: user.id, email: user.email, name: user.name, role: isRole(user.role) ? user.role : 'author', ...(user.image !== null && user.image !== '' && { image: user.image }) };
  }

  #changeOf(value: string): { user: string; email: string } | null {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === 'object' && parsed !== null && typeof (parsed as { user?: unknown }).user === 'string' && typeof (parsed as { email?: unknown }).email === 'string'
        ? (parsed as { user: string; email: string })
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Takes away someone's access: the person, their passkeys and every session of theirs, at
   * once. What they wrote stays. Nobody removes themselves, and the last owner stays.
   */
  async remove(actor: Actor, userId: string): Promise<void> {
    this.#access.require(actor, 'user:manage');
    const user = await this.#get(userId);
    if (actor.kind === 'user' && actor.id === userId) {
      throw new ConflictError('You cannot remove yourself. Ask another owner to do it.');
    }
    if (user.role === 'owner') await this.#requireAnotherOwner(userId, 'Make someone else an owner first.');
    // Sessions, passkeys and accounts go with the person: their rows are tied to this one.
    await this.#options.db.delete(authUser).where(eq(authUser.id, userId));
  }

  /**
   * Creates the site's first owner and a link that signs them in, without sending an email.
   * This is how a new site is reached before it has an email provider: the installer prints the
   * link. It refuses once anyone exists, so it cannot be used to take a site over.
   */
  async createFirstOwner(owner: Omit<Invitation, 'role'>): Promise<{ user: AuthUser; link: string }> {
    const [existing] = await this.#options.db.select({ id: authUser.id }).from(authUser).limit(1);
    if (existing) {
      throw new ConflictError('This site already has people who can sign in. Ask an owner to invite you.');
    }
    const user = await this.#create({ ...owner, role: 'owner' });
    return { user, link: await this.createSignInLink(user.email) };
  }

  /**
   * A link that signs one person in, handed back instead of emailed. For the command line and
   * for support: whoever holds it is that person, so it is never shown in the editor.
   */
  async createSignInLink(email: string): Promise<string> {
    const address = normalised(email);
    if (!(await this.#find(address))) throw new NotFoundError('Person with the email', address);
    const link = new Promise<string>((resolve) => this.#handBack.set(address, resolve));
    try {
      await this.#auth.api.signInMagicLink({ body: { email: address, callbackURL: this.#adminPath }, headers: new Headers() });
      return await link;
    } finally {
      this.#handBack.delete(address);
    }
  }

  async #create({ email, name, role }: Invitation): Promise<AuthUser> {
    const address = normalised(email);
    const issues = [
      ...(EMAIL.test(address) ? [] : [{ path: ['email'], message: 'Enter an email address, such as name@example.com.' }]),
      ...(name.trim() === '' ? [{ path: ['name'], message: 'Enter the person\'s name.' }] : []),
      ...(isRole(role) ? [] : [{ path: ['role'], message: `Choose a role: ${ROLES.join(', ')}.` }]),
    ];
    const [first] = issues;
    if (first) throw new ValidationError(first.message, issues);
    if (await this.#find(address)) throw new ConflictError(`${address} can already sign in.`);

    // Written straight to the table this package owns, not through the library's internals,
    // which change between its versions. The address starts out unverified: the only way in is
    // a link sent to it, and using one is what verifies it. That is also how the People screen
    // tells who was invited from who has signed in.
    const id = globalThis.crypto.randomUUID();
    await this.#options.db.insert(authUser).values({ id, email: address, name: name.trim(), emailVerified: false, role });
    return { id, email: address, name: name.trim(), role, hasSignedIn: false };
  }

  async #get(userId: string): Promise<AuthUser> {
    const [user] = await this.#options.db.select().from(authUser).where(eq(authUser.id, userId)).limit(1);
    if (!user) throw new NotFoundError('Person', userId);
    return { id: user.id, email: user.email, name: user.name, role: isRole(user.role) ? user.role : 'author', hasSignedIn: user.emailVerified };
  }

  /** Refuses a change that would leave the site with no owner, who alone can let people in. */
  async #requireAnotherOwner(userId: string, whatToDo: string): Promise<void> {
    const owners = await this.#options.db.select({ id: authUser.id }).from(authUser).where(eq(authUser.role, 'owner'));
    if (!owners.some((owner) => owner.id !== userId)) {
      throw new ConflictError(`This is the site's only owner, and a site needs one. ${whatToDo}`);
    }
  }

  async #find(address: string) {
    const [user] = await this.#options.db.select().from(authUser).where(eq(authUser.email, address)).limit(1);
    return user ?? null;
  }

  /**
   * Sends a sign-in link, but only to someone who has an account. The library asks for one to be
   * sent whoever the address belongs to; a stranger gets no email, and the request is answered
   * the same way, so nobody can use the form to learn who works on a site or to send mail.
   */
  async #deliver(email: string, url: string): Promise<void> {
    // Checked here whatever the library checks: a link must never carry someone, freshly signed
    // in, to another site. The request is answered as usual, and nothing is sent.
    if (!staysOnSite(url)) return;
    const address = normalised(email);
    const handBack = this.#handBack.get(address);
    if (handBack) return handBack(url);
    // No request is answered sooner than this wait. Without it, the time an email takes to
    // hand over would say whether the address belongs to someone here. The email is still
    // waited for, since a site may stop working the moment it has answered.
    const wait = new Promise<void>((resolve) => setTimeout(resolve, this.#options.answerAfterMs ?? 1000));
    const user = await this.#find(address);
    if (user && this.#mayEmail(address)) {
      // A link that cannot be sent is the owner's to hear of, in the log. Telling the person
      // asking would tell a stranger the same thing.
      const sending = this.#options.mailer
        .sendSignInLink({ email: address, name: user.name, url, expiresInMinutes: this.#lifetime, siteName: this.#options.siteName })
        .catch((error: unknown) => console.error('[velocity-cms] A sign-in link could not be sent.', error));
      await sending;
    }
    await wait;
  }

  /** Whether one more link may be emailed to an address, which counts it. Nobody's inbox is filled by a stranger asking. */
  #mayEmail(address: string): boolean {
    const now = Date.now();
    const since = now - LINKS_WINDOW_MS;
    if (this.#emailed.size > 5000) {
      for (const [known, times] of this.#emailed) if ((times.at(-1) ?? 0) <= since) this.#emailed.delete(known);
    }
    const times = (this.#emailed.get(address) ?? []).filter((time) => time > since);
    if (times.length >= LINKS_PER_ADDRESS) return false;
    this.#emailed.set(address, [...times, now]);
    return true;
  }
}
