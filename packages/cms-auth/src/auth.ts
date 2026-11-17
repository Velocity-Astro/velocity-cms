import { passkey } from '@better-auth/passkey';
import type { ApiSession, Authenticator } from '@velocity/cms-api';
import { AccessControl, CmsError, ConflictError, NotFoundError, ROLES, ValidationError, type Actor, type Role } from '@velocity/cms-core';
import { authAccount, authPasskey, authSession, authUser, authVerification, type Db } from '@velocity/cms-db';
import { betterAuth } from 'better-auth';
import { eq } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import type { Mailer } from './mailer.js';

/** Someone who can sign in to the editor. */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
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
  /** How long a sign-in link works for. Defaults to 10 minutes. */
  readonly linkLifetimeMinutes?: number;
  /** Decides who may invite people. Defaults to the CMS's own rules; pass `cms.access` to share them. */
  readonly access?: AccessControl;
}

/** The sign-in settings are wrong in a way that would leave the site unsafe or unreachable. */
export class AuthSetupError extends CmsError {
  readonly code = 'auth_setup';
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
export class CmsAuth implements Authenticator {
  readonly #options: CmsAuthOptions;
  readonly #access: AccessControl;
  readonly #adminPath: string;
  readonly #lifetime: number;
  readonly #auth;
  /** Links being made for `createSignInLink`, by email: they are handed back instead of emailed. */
  readonly #handBack = new Map<string, (url: string) => void>();

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
    this.#lifetime = options.linkLifetimeMinutes ?? 10;

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

  /** Who a request comes from, by its session cookie. This is what `CmsApi` asks. */
  async authenticate(request: Request): Promise<ApiSession | null> {
    const session = await this.#auth.api.getSession({ headers: request.headers });
    if (!session) return null;
    const { id, email, name, role } = session.user;
    // A role this version does not know grants nothing, rather than something by accident.
    if (!isRole(role)) return null;
    return { user: { id, email, name }, actor: { kind: 'user', id, role } };
  }

  /** Everyone who can sign in, by name. */
  async listUsers(actor: Actor): Promise<AuthUser[]> {
    this.#access.require(actor, 'user:manage');
    const rows = await this.#options.db.select().from(authUser);
    return rows
      .map(({ id, email, name, role }) => ({ id, email, name, role: isRole(role) ? role : 'author' }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
  }

  /** Lets someone in. They sign in with a link sent to this address; nothing is emailed yet. */
  async invite(actor: Actor, invitation: Invitation): Promise<AuthUser> {
    this.#access.require(actor, 'user:manage');
    return this.#create(invitation);
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
    // which change between its versions. The address is taken as verified: the only way in is
    // a link sent to it.
    const id = globalThis.crypto.randomUUID();
    await this.#options.db.insert(authUser).values({ id, email: address, name: name.trim(), emailVerified: true, role });
    return { id, email: address, name: name.trim(), role };
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
    const user = await this.#find(address);
    if (!user) return;
    await this.#options.mailer.sendSignInLink({
      email: address,
      name: user.name,
      url,
      expiresInMinutes: this.#lifetime,
      siteName: this.#options.siteName,
    });
  }
}
