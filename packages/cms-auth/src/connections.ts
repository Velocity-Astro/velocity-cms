import type { ApiSession, AskedConnection, ConnectedApp, ConnectionAnswer, Connections } from '@velocity-astro/cms-api';
import { AccessControl, ForbiddenError, NotFoundError, TOKEN_ROLES, ValidationError, tokenPermissions, type Actor, type Role } from '@velocity-astro/cms-core';
import { authApp, authConnection, authConnectionSecret, authUser, type Db } from '@velocity-astro/cms-db';
import { and, desc, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm';
import { TOKEN_PREFIX } from './tokens.js';

/** What a connected app's tokens start with. Both are access tokens to a scanner (`vcms_`), and told apart here. */
export const APP_TOKEN_PREFIX = `${TOKEN_PREFIX}app_`;
const REFRESH_PREFIX = `${TOKEN_PREFIX}renew_`;
const CODE_PREFIX = `${TOKEN_PREFIX}code_`;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** How long an app has to trade its code for tokens. */
const CODE_LIFE_MS = 5 * MINUTE_MS;
/** How long a token sent with each request works. The app gets the next one by itself. */
const ACCESS_LIFE_MS = 60 * MINUTE_MS;
/** How long an app that is not used stays connected. Every renewal starts the count again. */
const REFRESH_LIFE_MS = 90 * DAY_MS;
/** How long a renewing token still works after it was used, for an app whose answer was lost on the way. */
const REUSE_GRACE_MS = MINUTE_MS;
/** How often a connection's last use is written down. Every request would be a write. */
const USE_NOTED_EVERY_MS = MINUTE_MS;
/** How many apps may register in ten minutes. Anyone may, so the count is kept low and in the database. */
const REGISTRATIONS = 30;
const REGISTRATION_WINDOW_MS = 10 * MINUTE_MS;
/** How long an app nobody approved is kept. */
const UNAPPROVED_LIFE_MS = 7 * DAY_MS;
/** How long a renewing token that was used is remembered, so that a second use of it is known for what it is. */
const USED_KEPT_MS = 7 * DAY_MS;
const MAX_NAME_LENGTH = 80;
const MAX_REDIRECTS = 10;
const MAX_REDIRECT_LENGTH = 500;
const MAX_BODY_BYTES = 20_000;
/** What an app can ask for by name. What it gets is what the person allowed. */
const SCOPES = ['content', 'publish', 'personal_data'] as const;

const isTokenRole = (value: unknown): value is Role => TOKEN_ROLES.includes(value as Role);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hashOf = async (secret: string) => hex(await sha256(secret));
const random = (prefix: string) => `${prefix}${base64url(globalThis.crypto.getRandomValues(new Uint8Array(32)))}`;

/** The connected app's token a request carries, or `null`. */
export function appToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec((request.headers.get('authorization') ?? '').trim());
  return match?.[1]?.startsWith(APP_TOKEN_PREFIX) ? match[1] : null;
}

const LOOPBACK: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Schemes an app's address may never have: each runs or reads something in the browser. */
const UNSAFE_SCHEMES: ReadonlySet<string> = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:', 'ftp:', 'ws:', 'wss:']);

/**
 * An address an app may send a person back to: `https`, this computer over `http` (an app that
 * runs on it), or an app's own scheme (`cursor://…`). Nothing with a name and password in it,
 * and nothing a browser would run.
 */
function redirectFrom(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > MAX_REDIRECT_LENGTH || /[\s<>"\\]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username !== '' || url.password !== '' || url.hash !== '') return null;
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:') return LOOPBACK.has(url.hostname) ? url : null;
  return UNSAFE_SCHEMES.has(url.protocol) ? null : url;
}

const isLocal = (url: URL) => url.protocol === 'http:' && LOOPBACK.has(url.hostname);

/** Whether an address is one the app registered. An app on this computer listens on a port it cannot know ahead, so the port is not compared. */
function isRegistered(registered: readonly string[], given: URL): boolean {
  return registered.some((one) => {
    if (one === given.href) return true;
    const known = redirectFrom(one);
    return known !== null && isLocal(known) && isLocal(given) && known.hostname === given.hostname && known.pathname === given.pathname && known.search === given.search;
  });
}

/** Where a person is sent back to, as they are told it: a site's host, or the app's own scheme. */
const returnsTo = (url: URL) => (url.protocol === 'https:' || url.protocol === 'http:' ? url.hostname : url.protocol.replace(/:$/, ''));

function redirectsOf(stored: string): string[] {
  try {
    const list: unknown = JSON.parse(stored);
    return Array.isArray(list) ? list.filter((one): one is string => typeof one === 'string') : [];
  } catch {
    return [];
  }
}

/** A refusal in the words OAuth gives an app (RFC 6749, 5.2). */
class OAuthRefusal extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    description: string,
  ) {
    super(description);
  }
}

// An app's own side is reached from anywhere, with no cookie: an app in a browser may ask too.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, mcp-protocol-version', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const answer = (body: unknown, status = 200, headers: Readonly<Record<string, string>> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...headers } });
/** Words for the person, when there is no app to send them back to. Plain text: nothing typed is ever markup. */
const page = (status: number, words: string) =>
  new Response(words, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

export interface AppConnectionsOptions {
  /** The site's own address, such as `https://example.com`. Every address handed to an app is made from it. */
  readonly origin: string;
  /** Where the API is mounted. Defaults to `/api/cms`. */
  readonly apiPath?: string;
  /** Where the editor is mounted. Defaults to `/admin`. */
  readonly adminPath?: string;
  readonly access?: AccessControl;
  /** Told about a fault on the app's own side, which its answer says nothing about. */
  readonly onFault?: (error: unknown) => void;
}

interface Asked {
  readonly app: typeof authApp.$inferSelect;
  readonly redirect: URL;
  readonly state: string | null;
  readonly challenge: string;
}

/**
 * Apps that connect by themselves: OAuth 2.1 as the Model Context Protocol asks for it, so that
 * someone gives Claude or ChatGPT the site's MCP address, signs in, presses Allow, and is done.
 *
 * An app finds where to sign in from the refusal the MCP address gives it (RFC 9728, RFC 8414),
 * registers itself (RFC 7591), sends the person to the editor to approve it, and trades the
 * code it is sent back with for tokens (PKCE, S256 only). The token it sends with each request
 * lasts an hour; it gets the next one by itself with a renewing token that is used once.
 *
 * A connection is an access token made by pressing a button, and keeps every rule of one: an
 * owner approves it, it acts as an editor or an author with exactly `tokenPermissions`, and it
 * stops when it is taken away or when whoever connected it can no longer manage people. Only
 * hashes are kept. Registering grants nothing, since anyone may.
 */
export class AppConnections implements Connections {
  readonly #db: Db;
  readonly #access: AccessControl;
  readonly #origin: string;
  readonly #apiPath: string;
  readonly #adminPath: string;
  readonly #onFault: ((error: unknown) => void) | undefined;

  constructor(db: Db, options: AppConnectionsOptions) {
    this.#onFault = options.onFault;
    this.#db = db;
    this.#access = options.access ?? new AccessControl();
    this.#origin = new URL(options.origin).origin;
    this.#apiPath = options.apiPath ?? '/api/cms';
    this.#adminPath = options.adminPath ?? '/admin';
  }

  /** The MCP server's address: what a connection is for. */
  get #resource(): string {
    return `${this.#origin}${this.#apiPath}/mcp`;
  }

  get resourceMetadata(): string {
    return `${this.#origin}/.well-known/oauth-protected-resource${this.#apiPath}/mcp`;
  }

  /** Whether an address is one of the app's own side, which `handle` answers. */
  handles(pathname: string): boolean {
    return pathname.startsWith('/.well-known/oauth-') || pathname.startsWith(`${this.#apiPath}/oauth/`);
  }

  /** Answers a request to the app's own side. Never throws. Mount it at `/.well-known/oauth-*` and under `<api>/oauth/`. */
  readonly handle = async (request: Request): Promise<Response> => {
    const { pathname, searchParams } = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      const oauth = `${this.#apiPath}/oauth`;
      if (pathname === '/.well-known/oauth-protected-resource' || pathname === `/.well-known/oauth-protected-resource${this.#apiPath}/mcp`) {
        return this.#only(request, 'GET') ?? answer({ resource: this.#resource, authorization_servers: [this.#origin], bearer_methods_supported: ['header'], scopes_supported: SCOPES, resource_name: 'Velocity CMS' });
      }
      if (pathname.startsWith('/.well-known/oauth-authorization-server')) {
        return (
          this.#only(request, 'GET') ??
          answer({
            issuer: this.#origin,
            authorization_endpoint: `${this.#origin}${oauth}/authorize`,
            token_endpoint: `${this.#origin}${oauth}/token`,
            registration_endpoint: `${this.#origin}${oauth}/register`,
            revocation_endpoint: `${this.#origin}${oauth}/revoke`,
            response_types_supported: ['code'],
            response_modes_supported: ['query'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none'],
            revocation_endpoint_auth_methods_supported: ['none'],
            scopes_supported: SCOPES,
            authorization_response_iss_parameter_supported: true,
          })
        );
      }
      if (pathname === `${oauth}/register`) return this.#only(request, 'POST') ?? (await this.#register(await this.#sent(request)));
      if (pathname === `${oauth}/authorize`) return this.#only(request, 'GET') ?? (await this.#authorize(searchParams));
      if (pathname === `${oauth}/token`) return this.#only(request, 'POST') ?? (await this.#token(await this.#sent(request)));
      if (pathname === `${oauth}/revoke`) return this.#only(request, 'POST') ?? (await this.#revoke(await this.#sent(request)));
      return answer({ error: 'not_found', error_description: 'There is nothing at this address.' }, 404);
    } catch (error) {
      if (error instanceof OAuthRefusal) return answer({ error: error.error, error_description: error.message }, error.status);
      // What went wrong inside is not the app's to know.
      this.#onFault?.(error);
      return answer({ error: 'server_error', error_description: 'Something went wrong on the server. Try again in a moment.' }, 500);
    }
  };

  #only(request: Request, method: string): Response | null {
    return request.method === method ? null : answer({ error: 'invalid_request', error_description: `This address takes ${method}.` }, 405, { allow: `${method}, OPTIONS` });
  }

  /** What an app sent, as a form or as JSON, read with its limit in force. */
  async #sent(request: Request): Promise<Record<string, unknown>> {
    const reader = request.body?.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new OAuthRefusal(413, 'invalid_request', 'That request is too large.');
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const part of parts) {
      bytes.set(part, at);
      at += part.byteLength;
    }
    const text = new TextDecoder().decode(bytes);
    if ((request.headers.get('content-type') ?? '').toLowerCase().includes('json')) {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      if (!isObject(body)) throw new OAuthRefusal(400, 'invalid_request', 'Send a JSON object.');
      return body;
    }
    return Object.fromEntries(new URLSearchParams(text));
  }

  /** An app says what it is called and where it sends people back to, and is given an id. It may do nothing yet. */
  async #register(sent: Record<string, unknown>): Promise<Response> {
    const uris = Array.isArray(sent['redirect_uris']) ? sent['redirect_uris'] : [];
    const redirects = uris.map(redirectFrom);
    if (redirects.length === 0 || redirects.length > MAX_REDIRECTS || redirects.some((one) => one === null)) {
      throw new OAuthRefusal(400, 'invalid_redirect_uri', `Give 1 to ${MAX_REDIRECTS} redirect addresses: https, or http on this computer (localhost), or the app's own scheme.`);
    }
    const typed = typeof sent['client_name'] === 'string' ? sent['client_name'] : '';
    // A name is shown to the person who decides: words on one line, and nothing that could be read as markup.
    const name = typed.replace(/[\p{Cc}<>]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);

    const now = Date.now();
    await this.#db.delete(authApp).where(and(eq(authApp.approved, false), lt(authApp.createdAt, new Date(now - UNAPPROVED_LIFE_MS))));
    const [recent] = await this.#db
      .select({ count: sql<number>`count(*)` })
      .from(authApp)
      .where(gt(authApp.createdAt, new Date(now - REGISTRATION_WINDOW_MS)));
    if ((recent?.count ?? 0) >= REGISTRATIONS) {
      return answer({ error: 'temporarily_unavailable', error_description: 'Too many apps registered just now. Try again in a few minutes.' }, 429, { 'retry-after': '600' });
    }

    const id = globalThis.crypto.randomUUID();
    const redirectUris = redirects.map((one) => one?.href ?? '');
    await this.#db.insert(authApp).values({ id, name: name === '' ? 'An app' : name, redirectUris: JSON.stringify(redirectUris), approved: false, createdAt: new Date(now) });
    return answer(
      {
        client_id: id,
        client_id_issued_at: Math.floor(now / 1000),
        client_name: name === '' ? 'An app' : name,
        redirect_uris: redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
      201,
    );
  }

  /**
   * What an app asked for, checked. A request whose app or return address is not known is
   * refused to the person and sent nowhere; any other fault goes back to the app, as OAuth says.
   */
  async #asked(params: URLSearchParams): Promise<Asked | { readonly back: string } | { readonly problem: string }> {
    const [app] = await this.#db
      .select()
      .from(authApp)
      .where(eq(authApp.id, params.get('client_id') ?? ''))
      .limit(1);
    if (!app) return { problem: 'This site does not know the app that sent you here. Remove the connection in the app, add it again, and try once more.' };
    const redirect = redirectFrom(params.get('redirect_uri') ?? redirectsOf(app.redirectUris)[0]);
    if (redirect === null || !isRegistered(redirectsOf(app.redirectUris), redirect)) {
      return { problem: 'The app asked to send you somewhere it did not register, so nothing was connected. Remove the connection in the app, add it again, and try once more.' };
    }
    const state = params.get('state');
    const refuse = (error: string, description: string) => ({ back: this.#back(redirect, { error, error_description: description }, state) });
    if (params.get('response_type') !== 'code') return refuse('unsupported_response_type', 'Only response_type=code is supported.');
    const challenge = params.get('code_challenge') ?? '';
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge) || params.get('code_challenge_method') !== 'S256') {
      return refuse('invalid_request', 'Send a code_challenge with code_challenge_method=S256 (PKCE).');
    }
    const resource = params.get('resource');
    if (resource !== null && !this.#isOwnResource(resource)) return refuse('invalid_target', `This site connects apps to ${this.#resource} only.`);
    return { app, redirect, state, challenge };
  }

  #isOwnResource(resource: string): boolean {
    const given = resource.replace(/\/$/, '');
    return given === this.#resource || given === this.#origin;
  }

  /** The app's return address, with what it is told. */
  #back(redirect: URL, told: Readonly<Record<string, string>>, state: string | null): string {
    const url = new URL(redirect.href);
    for (const [name, value] of Object.entries(told)) url.searchParams.set(name, value);
    if (state !== null) url.searchParams.set('state', state);
    url.searchParams.set('iss', this.#origin);
    return url.href;
  }

  /** Where an app sends the person: on to the editor, which signs them in and asks. */
  async #authorize(params: URLSearchParams): Promise<Response> {
    const asked = await this.#asked(params);
    if ('problem' in asked) return page(400, asked.problem);
    const to = 'back' in asked ? asked.back : `${this.#origin}${this.#adminPath}/connect?${params.toString()}`;
    return new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store' } });
  }

  async asked(actor: Actor, query: string): Promise<AskedConnection> {
    this.#requireOwner(actor);
    const asked = await this.#asked(new URLSearchParams(query));
    if ('problem' in asked) throw new ValidationError(asked.problem, []);
    if ('back' in asked) throw new ValidationError('The app sent a request this site cannot take. Remove the connection in the app, add it again, and try once more.', []);
    return { appName: asked.app.name, returnsTo: returnsTo(asked.redirect), isLocal: isLocal(asked.redirect) };
  }

  async answer(actor: Actor, query: string, given: ConnectionAnswer): Promise<{ readonly redirect: string }> {
    this.#requireOwner(actor);
    if (actor.kind !== 'user') throw new ForbiddenError('An app is connected by a person who is signed in to the editor.');
    const asked = await this.#asked(new URLSearchParams(query));
    if ('problem' in asked) throw new ValidationError(asked.problem, []);
    if ('back' in asked) return { redirect: asked.back };
    if (!given.allow) return { redirect: this.#back(asked.redirect, { error: 'access_denied', error_description: 'The person did not allow it.' }, asked.state) };
    if (!isTokenRole(given.role)) {
      const message = `An app acts as ${TOKEN_ROLES.join(' or ')}. People, plugins and settings stay with a person.`;
      throw new ValidationError(message, [{ path: ['role'], message }]);
    }

    const now = Date.now();
    // Connections nothing renews any more, and this person's earlier connection of the same app.
    await this.#db.delete(authConnection).where(lt(authConnection.expiresAt, new Date(now)));
    await this.#db.delete(authConnection).where(and(eq(authConnection.appId, asked.app.id), eq(authConnection.userId, actor.id)));
    const id = globalThis.crypto.randomUUID();
    const code = random(CODE_PREFIX);
    const expiresAt = new Date(now + CODE_LIFE_MS);
    await this.#db.insert(authConnection).values({ id, appId: asked.app.id, userId: actor.id, role: given.role, canPublish: given.publish, personalData: given.personalData, expiresAt, lastUsedAt: null, createdAt: new Date(now) });
    await this.#db.insert(authConnectionSecret).values({ hash: await hashOf(code), connectionId: id, kind: 'code', expiresAt, usedAt: null, redirectUri: asked.redirect.href, challenge: asked.challenge, createdAt: new Date(now) });
    await this.#db.update(authApp).set({ approved: true }).where(eq(authApp.id, asked.app.id));
    return { redirect: this.#back(asked.redirect, { code }, asked.state) };
  }

  async listConnections(actor: Actor): Promise<ConnectedApp[]> {
    this.#access.require(actor, 'user:manage');
    const rows = await this.#db
      .select({ connection: authConnection, app: authApp, by: authUser.name })
      .from(authConnection)
      .innerJoin(authApp, eq(authConnection.appId, authApp.id))
      .innerJoin(authUser, eq(authConnection.userId, authUser.id))
      .where(gt(authConnection.expiresAt, new Date()))
      .orderBy(desc(authConnection.createdAt));
    return rows.map(({ connection, app, by }) => {
      const first = redirectFrom(redirectsOf(app.redirectUris)[0]);
      return {
        id: connection.id,
        name: app.name,
        returnsTo: first ? returnsTo(first) : '',
        role: isTokenRole(connection.role) ? connection.role : 'author',
        publish: connection.canPublish,
        personalData: connection.personalData,
        lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
        createdAt: connection.createdAt.toISOString(),
        connectedBy: by,
      };
    });
  }

  async disconnect(actor: Actor, id: string): Promise<void> {
    this.#access.require(actor, 'user:manage');
    const removed = await this.#db.delete(authConnection).where(eq(authConnection.id, id)).returning({ id: authConnection.id });
    if (removed.length === 0) throw new NotFoundError('Connected app', id);
  }

  #requireOwner(actor: Actor): void {
    if (!this.#access.can(actor, 'user:manage')) throw new ForbiddenError('Only an owner of this site can connect an app. Ask an owner to connect it, or to make you one.');
  }

  /** A code or a renewing token traded for the next pair of tokens. */
  async #token(sent: Record<string, unknown>): Promise<Response> {
    const said = (name: string) => (typeof sent[name] === 'string' ? sent[name] : '');
    const grant = said('grant_type');
    if (grant !== 'authorization_code' && grant !== 'refresh_token') throw new OAuthRefusal(400, 'unsupported_grant_type', 'Use grant_type authorization_code or refresh_token.');
    const secret = grant === 'authorization_code' ? said('code') : said('refresh_token');
    const kind = grant === 'authorization_code' ? 'code' : 'refresh';
    const gone = new OAuthRefusal(400, 'invalid_grant', grant === 'authorization_code' ? 'That code has ended or was already used. Start connecting again.' : 'This app is no longer connected. Connect it again.');

    const hash = await hashOf(secret);
    const [found] = await this.#db
      .select({ secret: authConnectionSecret, connection: authConnection, makerRole: authUser.role })
      .from(authConnectionSecret)
      .innerJoin(authConnection, eq(authConnectionSecret.connectionId, authConnection.id))
      .innerJoin(authUser, eq(authConnection.userId, authUser.id))
      .where(and(eq(authConnectionSecret.hash, hash), eq(authConnectionSecret.kind, kind)))
      .limit(1);
    if (!found) throw gone;
    const { connection } = found;
    const now = Date.now();
    // The app that was given it, and nobody else.
    if (said('client_id') !== connection.appId) throw new OAuthRefusal(400, 'invalid_client', 'That is not the app this was given to.');
    const used = found.secret.usedAt?.getTime() ?? null;
    // Used before, and not a moment ago: someone else holds a copy. The connection ends for both.
    if (used !== null && (kind === 'code' || now - used > REUSE_GRACE_MS)) {
      await this.#db.delete(authConnection).where(eq(authConnection.id, connection.id));
      throw gone;
    }
    if (found.secret.expiresAt.getTime() <= now || found.makerRole !== 'owner' || !isTokenRole(connection.role)) throw gone;
    const resource = said('resource');
    if (resource !== '' && !this.#isOwnResource(resource)) throw new OAuthRefusal(400, 'invalid_target', `This site connects apps to ${this.#resource} only.`);

    if (kind === 'code') {
      const redirect = said('redirect_uri');
      if (redirect !== '' && redirect !== found.secret.redirectUri) throw gone;
      const verifier = said('code_verifier');
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || base64url(await sha256(verifier)) !== found.secret.challenge) throw gone;
      // Used once: of two requests with one code, only the first finds it unused.
      const taken = await this.#db
        .update(authConnectionSecret)
        .set({ usedAt: new Date(now) })
        .where(and(eq(authConnectionSecret.hash, hash), isNull(authConnectionSecret.usedAt)))
        .returning({ hash: authConnectionSecret.hash });
      if (taken.length === 0) throw gone;
    } else if (used === null) {
      await this.#db.update(authConnectionSecret).set({ usedAt: new Date(now) }).where(eq(authConnectionSecret.hash, hash));
    }

    const access = random(APP_TOKEN_PREFIX);
    const refresh = random(REFRESH_PREFIX);
    const renewsUntil = new Date(now + REFRESH_LIFE_MS);
    await this.#db.insert(authConnectionSecret).values([
      { hash: await hashOf(access), connectionId: connection.id, kind: 'access', expiresAt: new Date(now + ACCESS_LIFE_MS), usedAt: null, redirectUri: null, challenge: null, createdAt: new Date(now) },
      { hash: await hashOf(refresh), connectionId: connection.id, kind: 'refresh', expiresAt: renewsUntil, usedAt: null, redirectUri: null, challenge: null, createdAt: new Date(now) },
    ]);
    await this.#db.update(authConnection).set({ expiresAt: renewsUntil }).where(eq(authConnection.id, connection.id));
    // What has ended is of no more use. A used one is remembered a while: a second use of it ends the connection.
    await this.#db
      .delete(authConnectionSecret)
      .where(and(eq(authConnectionSecret.connectionId, connection.id), ne(authConnectionSecret.hash, hash), lt(authConnectionSecret.expiresAt, new Date(now))));
    await this.#db
      .delete(authConnectionSecret)
      .where(and(eq(authConnectionSecret.connectionId, connection.id), ne(authConnectionSecret.hash, hash), lt(authConnectionSecret.usedAt, new Date(now - USED_KEPT_MS))));

    const scope = ['content', ...(connection.canPublish ? ['publish'] : []), ...(connection.personalData ? ['personal_data'] : [])].join(' ');
    return answer({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_LIFE_MS / 1000, refresh_token: refresh, scope }, 200, { pragma: 'no-cache' });
  }

  /** An app gives a token up (RFC 7009): the whole connection ends, whichever token it was. The answer is the same whether or not it was known. */
  async #revoke(sent: Record<string, unknown>): Promise<Response> {
    const token = typeof sent['token'] === 'string' ? sent['token'] : '';
    const [found] = await this.#db
      .select({ connectionId: authConnectionSecret.connectionId })
      .from(authConnectionSecret)
      .where(and(eq(authConnectionSecret.hash, await hashOf(token)), ne(authConnectionSecret.kind, 'code')))
      .limit(1);
    if (found) await this.#db.delete(authConnection).where(eq(authConnection.id, found.connectionId));
    return answer({});
  }

  /**
   * Who a request comes from, by the connected app's token it carries: `null` when it carries
   * none, or one that has ended, was taken away, or whose person can no longer manage people.
   */
  async authenticate(request: Request): Promise<ApiSession | null> {
    const token = appToken(request);
    if (token === null) return null;
    const [found] = await this.#db
      .select({ connection: authConnection, name: authApp.name, makerRole: authUser.role })
      .from(authConnectionSecret)
      .innerJoin(authConnection, eq(authConnectionSecret.connectionId, authConnection.id))
      .innerJoin(authApp, eq(authConnection.appId, authApp.id))
      .innerJoin(authUser, eq(authConnection.userId, authUser.id))
      .where(and(eq(authConnectionSecret.hash, await hashOf(token)), eq(authConnectionSecret.kind, 'access'), gt(authConnectionSecret.expiresAt, new Date())))
      .limit(1);
    if (!found) return null;
    const { connection, name, makerRole } = found;
    // A role this version does not know grants nothing. Nor does a connection whose person was made less than an owner.
    if (!isTokenRole(connection.role) || makerRole !== 'owner') return null;
    if (connection.lastUsedAt === null || Date.now() - connection.lastUsedAt.getTime() > USE_NOTED_EVERY_MS) {
      await this.#db.update(authConnection).set({ lastUsedAt: new Date() }).where(eq(authConnection.id, connection.id));
    }
    const permissions = tokenPermissions(connection.role, { publish: connection.canPublish, personalData: connection.personalData });
    return { user: { id: connection.id, email: '', name }, actor: { kind: 'agent', id: connection.id, role: connection.role, permissions } };
  }
}
