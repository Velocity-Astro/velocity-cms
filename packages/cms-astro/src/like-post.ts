import { CmsError, NotFoundError, ValidationError, isLiveType, type Cms, type LikeState } from '@velocity-astro/cms-core';
import { MemoryRateLimiter, readLimited, type RateLimiter } from './form-post.js';
import { SITE } from './connection.js';

/** Where a page asks for likes and sends them. */
export const LIKES_PATH = '/api/cms/likes';
/** The largest post a like may send: a type, an entry, a visitor and a yes or no. */
export const MAX_LIKE_POST_BYTES = 1024;
/** What a browser's own id may be made of: a random id it keeps, never anything about the person. */
const BROWSER_ID = /^[A-Za-z0-9_-]{16,64}$/;
/** An entry as a page names it: its translation group, or the live loader's `<locale>/<slug>`. */
const ENTRY = /^[\w-]{1,100}(\/[\w-]{1,100}){0,8}$/;
const KEY = /^[a-z][a-z0-9_-]{0,63}$/;

export interface LikePostsOptions {
  readonly cms: Cms;
  /** The site's own address, which a like must come from. A function is asked for each request. */
  readonly origin: string | ((request: Request) => string);
  /** The site's secret. A browser's id is kept only as a hash made with it. */
  readonly secret?: string | undefined;
  /** How many likes one address may send. Left out, 60 in ten minutes in this server's memory. */
  readonly limiter?: RateLimiter;
  /** How many times one address may ask for counts. Left out, 600 in ten minutes. */
  readonly readLimiter?: RateLimiter;
  readonly onFault?: (error: unknown) => void;
}

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * The hash that stands for a browser: its random id, signed with the site's secret, so the id
 * a visitor's browser keeps is never stored and one site's hashes mean nothing on another.
 */
export async function visitorHash(secret: string | undefined, browser: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret ?? 'velocity-cms'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`velocity-cms like\n${browser}`)));
}

/**
 * The address a page's like button talks to (`/api/cms/likes`), which anyone may reach.
 *
 * `GET ?type=<type key>&entries=<entry>,<entry>` answers with how many likes each has, when the
 * type shows its count. `POST` with JSON `{ type, entry, browser, liked }` likes an entry or
 * takes the like back. An entry is named by its translation group or by the live loader's
 * `<locale>/<slug>`, and `browser` is a random id the visitor's browser keeps. A post must come
 * from the site's own pages as JSON, is small, and one address may send only so many. Nothing a
 * visitor sends is written back except the yes or no and the count.
 */
export class LikePosts {
  readonly #options: LikePostsOptions;
  readonly #limiter: RateLimiter;
  readonly #readLimiter: RateLimiter;

  constructor(options: LikePostsOptions) {
    this.#options = options;
    this.#limiter = options.limiter ?? new MemoryRateLimiter(60);
    this.#readLimiter = options.readLimiter ?? new MemoryRateLimiter(600);
  }

  async handle(request: Request, address?: string): Promise<Response> {
    try {
      if (request.method === 'GET') return await this.#counts(request, address);
      if (request.method === 'POST') return await this.#like(request, address);
      return refuse(405, 'method_not_allowed', 'Likes are read with GET and sent with POST.', { allow: 'GET, POST' });
    } catch (error) {
      if (error instanceof NotFoundError) return refuse(404, 'not_found', 'There is no entry here that takes likes.');
      if (error instanceof ValidationError) return refuse(400, 'invalid', error.message);
      if (error instanceof CmsError) return refuse(409, 'refused', error.message);
      this.#options.onFault?.(error);
      return refuse(500, 'failed', 'The like could not be counted. Try again in a moment.');
    }
  }

  async #counts(request: Request, address: string | undefined): Promise<Response> {
    if (address !== undefined && !(await this.#readLimiter.take(address))) return refuse(429, 'too_many', 'Too many requests came from here in a short time. Wait a few minutes and try again.', { 'retry-after': '600' });
    const query = new URL(request.url).searchParams;
    const type = query.get('type') ?? '';
    const asked = (query.get('entries') ?? '').split(',').filter((one) => one !== '');
    if (!KEY.test(type) || asked.length === 0 || asked.some((one) => !ENTRY.test(one))) throw new ValidationError('Ask with `type` and `entries`, a list of entries separated by commas.', []);
    const groups = await this.#groups(type, asked);
    const counted = await this.#options.cms.likes.publicCounts(type, [...new Set(groups.values())]);
    const counts: Record<string, number> = {};
    for (const [name, group] of groups) if (counted[group] !== undefined) counts[name] = counted[group];
    return answer({ counts });
  }

  async #like(request: Request, address: string | undefined): Promise<Response> {
    const origin = typeof this.#options.origin === 'string' ? this.#options.origin : this.#options.origin(request);
    // A browser always says where a fetch with a body comes from. One that names another site, or none, is not from a page of this one.
    if (request.headers.get('origin') !== origin) return refuse(403, 'forbidden', 'A like can only be sent from the site it is on.');
    if (!(request.headers.get('content-type') ?? '').includes('application/json')) return refuse(415, 'unsupported', 'Send a like as JSON.');
    if (Number(request.headers.get('content-length') ?? 0) > MAX_LIKE_POST_BYTES) return refuse(413, 'too_large', 'That is more than a like.');
    if (address !== undefined && !(await this.#limiter.take(address))) return refuse(429, 'too_many', 'Too many likes came from here in a short time. Wait a few minutes and try again.', { 'retry-after': '600' });
    const bytes = await readLimited(request, MAX_LIKE_POST_BYTES);
    if (bytes === null) return refuse(413, 'too_large', 'That is more than a like.');
    let sent: unknown;
    try {
      sent = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return refuse(400, 'invalid', 'Send a like as JSON.');
    }
    const body = typeof sent === 'object' && sent !== null ? (sent as Record<string, unknown>) : {};
    const { type, entry, browser, liked } = body;
    if (typeof type !== 'string' || !KEY.test(type) || typeof entry !== 'string' || !ENTRY.test(entry)) throw new NotFoundError('Entry that takes likes', String(entry));
    if (typeof browser !== 'string' || !BROWSER_ID.test(browser)) throw new ValidationError('A like needs `browser`: the random id this browser keeps.', []);
    if (typeof liked !== 'boolean') throw new ValidationError('Say `liked`: true to like the entry, false to take the like back.', []);
    const group = (await this.#groups(type, [entry])).get(entry);
    if (group === undefined) throw new NotFoundError('Entry that takes likes', entry);
    const state: LikeState = await this.#options.cms.likes.like({ type, entry: group }, await visitorHash(this.#options.secret, browser), liked);
    return answer(state);
  }

  /** The translation group of each entry a page named, leaving out the ones that lead nowhere. */
  async #groups(typeKey: string, names: readonly string[]): Promise<Map<string, string>> {
    const groups = new Map<string, string>();
    const paths = names.filter((name) => name.includes('/'));
    for (const name of names) if (!name.includes('/')) groups.set(name, name);
    if (paths.length === 0) return groups;
    const { cms } = this.#options;
    const type = (await cms.schema.list()).find((candidate) => candidate.key === typeKey && isLiveType(candidate));
    if (!type) return groups;
    for (const path of paths) {
      const at = path.indexOf('/');
      const found = await cms.content.findBySlug(SITE, { typeId: type.id, locale: path.slice(0, at), slug: path.slice(at + 1), version: 'published' });
      if (found) groups.set(path, found.translationGroup);
    }
    return groups;
  }
}

const answer = (body: unknown) => Response.json(body, { headers: { 'cache-control': 'no-store' } });
const refuse = (status: number, code: string, message: string, extra: Record<string, string> = {}) => Response.json({ error: { code, message } }, { status, headers: { 'cache-control': 'no-store', ...extra } });
