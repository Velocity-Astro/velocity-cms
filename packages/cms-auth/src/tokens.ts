import type { AccessToken, ApiSession, MadeAccessToken, NewAccessToken, Tokens } from '@velocity-astro/cms-api';
import { AccessControl, NotFoundError, TOKEN_ROLES, ValidationError, tokenPermissions, type Actor, type Role } from '@velocity-astro/cms-core';
import { authToken, authUser, type Db } from '@velocity-astro/cms-db';
import { and, desc, eq, gt } from 'drizzle-orm';

/** What every token starts with, so a leaked one is easy to recognise and to search for. */
export const TOKEN_PREFIX = 'vcms_';
const MAX_DAYS = 365;
const MAX_NAME_LENGTH = 200;
/** How often a token's last use is written down. Every request would be a write. */
const USE_NOTED_EVERY_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

const isTokenRole = (value: unknown): value is Role => TOKEN_ROLES.includes(value as Role);

async function hashOf(token: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function newToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return `${TOKEN_PREFIX}${Buffer.from(bytes).toString('base64url')}`;
}

/** The token a request carries as `Authorization: Bearer vcms_…`, or `null`. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1]?.startsWith(TOKEN_PREFIX) ? match[1] : null;
}

/**
 * Access tokens, kept in the CMS's own database (`auth_token`). Only a hash of each is stored, so
 * a copy of the database opens nothing. A token acts as an `agent` with exactly the permissions
 * `tokenPermissions` gives it: an editor's or an author's writing, publishing only when allowed,
 * personal data only when allowed, and never people, plugins, settings or content types.
 */
export class AccessTokens implements Tokens {
  readonly #db: Db;
  readonly #access: AccessControl;

  constructor(db: Db, access: AccessControl = new AccessControl()) {
    this.#db = db;
    this.#access = access;
  }

  async listTokens(actor: Actor): Promise<AccessToken[]> {
    this.#access.require(actor, 'user:manage');
    const rows = await this.#db
      .select({ token: authToken, maker: authUser.name })
      .from(authToken)
      .leftJoin(authUser, eq(authToken.userId, authUser.id))
      .where(gt(authToken.expiresAt, new Date()))
      .orderBy(desc(authToken.createdAt));
    return rows.map(({ token, maker }) => shown(token, maker));
  }

  /** Makes a token. The token itself is in the answer and nowhere else, ever: only its hash is kept. */
  async createToken(actor: Actor, input: NewAccessToken): Promise<MadeAccessToken> {
    this.#access.require(actor, 'user:manage');
    const name = input.name.trim();
    const issues = [
      ...(name === '' || name.length > MAX_NAME_LENGTH ? [{ path: ['name'], message: `Say what the token is for, in ${MAX_NAME_LENGTH} characters or fewer, such as "Claude on my laptop".` }] : []),
      ...(isTokenRole(input.role) ? [] : [{ path: ['role'], message: `A token acts as ${TOKEN_ROLES.join(' or ')}. People, plugins and settings stay with a person.` }]),
      ...(Number.isInteger(input.days) && input.days >= 1 && input.days <= MAX_DAYS ? [] : [{ path: ['days'], message: `A token works for 1 to ${MAX_DAYS} days.` }]),
    ];
    const [first] = issues;
    if (first) throw new ValidationError(first.message, issues);

    const secret = newToken();
    const id = globalThis.crypto.randomUUID();
    const row = {
      id,
      name,
      hash: await hashOf(secret),
      hint: secret.slice(-4),
      role: input.role,
      canPublish: input.publish,
      personalData: input.personalData,
      // Made from the command line, a token belongs to nobody, and lasts until it ends or is taken away.
      userId: actor.kind === 'user' ? actor.id : null,
      expiresAt: new Date(Date.now() + input.days * DAY_MS),
      lastUsedAt: null,
      createdAt: new Date(),
    };
    await this.#db.insert(authToken).values(row);
    const [maker] = row.userId ? await this.#db.select({ name: authUser.name }).from(authUser).where(eq(authUser.id, row.userId)).limit(1) : [];
    return { token: shown(row, maker?.name ?? null), secret };
  }

  async revokeToken(actor: Actor, id: string): Promise<void> {
    this.#access.require(actor, 'user:manage');
    const removed = await this.#db.delete(authToken).where(eq(authToken.id, id)).returning({ id: authToken.id });
    if (removed.length === 0) throw new NotFoundError('Access token', id);
  }

  /**
   * Who a request comes from, by the token it carries: `null` when it carries none, or one that
   * has ended, was taken away, or whose maker can no longer manage people.
   */
  async authenticate(request: Request): Promise<ApiSession | null> {
    const token = bearerToken(request);
    if (token === null) return null;
    const [found] = await this.#db
      .select({ token: authToken, makerRole: authUser.role })
      .from(authToken)
      .leftJoin(authUser, eq(authToken.userId, authUser.id))
      .where(and(eq(authToken.hash, await hashOf(token)), gt(authToken.expiresAt, new Date())))
      .limit(1);
    if (!found) return null;
    const { token: row, makerRole } = found;
    // A role this version does not know grants nothing. Nor does a token whose maker was made less than an owner.
    if (!isTokenRole(row.role)) return null;
    if (row.userId !== null && makerRole !== 'owner') return null;
    if (row.lastUsedAt === null || Date.now() - row.lastUsedAt.getTime() > USE_NOTED_EVERY_MS) {
      await this.#db.update(authToken).set({ lastUsedAt: new Date() }).where(eq(authToken.id, row.id));
    }
    const permissions = tokenPermissions(row.role, { publish: row.canPublish, personalData: row.personalData });
    return { user: { id: row.id, email: '', name: row.name }, actor: { kind: 'agent', id: row.id, role: row.role, permissions } };
  }
}

type Row = typeof authToken.$inferSelect;

function shown(row: Row, maker: string | null): AccessToken {
  return {
    id: row.id,
    name: row.name,
    hint: row.hint,
    role: isTokenRole(row.role) ? row.role : 'author',
    publish: row.canPublish,
    personalData: row.personalData,
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    madeBy: maker,
  };
}
