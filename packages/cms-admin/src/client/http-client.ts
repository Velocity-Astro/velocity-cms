import { readImage, type ContentTypeDef, type Entry, type NewUpload, type Page, type SiteImage } from '@velocity/cms-core';
import type { AdminClient, EntryChanges, EntryListQuery, FieldTypeInfo, ImageList, NewEntry, SessionUser } from './admin-client.js';
import { AdminRequestError, type RequestErrorCode, type RequestIssue } from './errors.js';

/**
 * Signing in and out. This is `cms-auth`'s side of the server, which has its own addresses and,
 * for passkeys, its own conversation with the browser, so the client is handed it ready-made.
 */
export type AuthClient = Pick<AdminClient, 'requestSignInLink' | 'signInWithPasskey' | 'signOut'>;

export interface HttpAdminClientOptions {
  readonly auth: AuthClient;
  /** Where the API is mounted. Defaults to `/api/cms`, on the site the editor is served from. */
  readonly baseUrl?: string;
  /** Defaults to the browser's own `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

const CODES: ReadonlySet<string> = new Set<RequestErrorCode>(['validation_failed', 'conflict', 'not_found', 'forbidden', 'unauthenticated']);

/** The `AdminClient` the editor uses on a real site: each method is one request to `cms-api`. */
export class HttpAdminClient implements AdminClient {
  readonly #auth: AuthClient;
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: HttpAdminClientOptions) {
    this.#auth = options.auth;
    this.#baseUrl = (options.baseUrl ?? '/api/cms').replace(/\/+$/, '');
    // Called through a closure: a browser's `fetch` refuses to run as another object's method.
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async getSession(): Promise<SessionUser | null> {
    return (await this.#get<{ user: SessionUser | null }>('/session')).user;
  }

  requestSignInLink(email: string): Promise<void> {
    return this.#auth.requestSignInLink(email);
  }

  signInWithPasskey(): Promise<SessionUser> {
    return this.#auth.signInWithPasskey();
  }

  signOut(): Promise<void> {
    return this.#auth.signOut();
  }

  async listContentTypes(): Promise<readonly ContentTypeDef[]> {
    return (await this.#get<{ items: ContentTypeDef[] }>('/content-types')).items;
  }

  async listFieldTypes(): Promise<readonly FieldTypeInfo[]> {
    return (await this.#get<{ items: FieldTypeInfo[] }>('/field-types')).items;
  }

  listImages(): Promise<ImageList> {
    return this.#get('/images');
  }

  uploadImage(upload: NewUpload): Promise<SiteImage> {
    // The file travels as it is. If it is no image at all, the server says so in its own words.
    const type = readImage(upload.bytes)?.contentType ?? 'image/jpeg';
    return this.#request(`/images?${new URLSearchParams({ name: upload.fileName })}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': type },
      body: upload.bytes as BodyInit,
    });
  }

  listEntries(query: EntryListQuery): Promise<Page<Entry>> {
    const search = new URLSearchParams({ type: query.type });
    if (query.locale !== undefined) search.set('locale', query.locale);
    if (query.limit !== undefined) search.set('limit', String(query.limit));
    if (query.offset !== undefined) search.set('offset', String(query.offset));
    return this.#get(`/entries?${search}`);
  }

  getEntry(id: string): Promise<Entry> {
    return this.#get(`/entries/${encodeURIComponent(id)}`);
  }

  createEntry(entry: NewEntry): Promise<Entry> {
    return this.#send('POST', '/entries', entry);
  }

  updateEntry(id: string, changes: EntryChanges): Promise<Entry> {
    return this.#send('PATCH', `/entries/${encodeURIComponent(id)}`, changes);
  }

  publishEntry(id: string, expectedRevision: number): Promise<Entry> {
    return this.#send('POST', `/entries/${encodeURIComponent(id)}/publish`, { expectedRevision });
  }

  unpublishEntry(id: string): Promise<Entry> {
    return this.#send('POST', `/entries/${encodeURIComponent(id)}/unpublish`, {});
  }

  #get<T>(path: string): Promise<T> {
    return this.#request(path, { headers: { accept: 'application/json' } });
  }

  #send<T>(method: string, path: string, body: unknown): Promise<T> {
    return this.#request(path, {
      method,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async #request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      // The session travels as a cookie, which is sent only to the site the editor came from.
      response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, credentials: 'same-origin' });
    } catch {
      throw new Error('The server could not be reached. Check your connection and try again.');
    }
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) return body as T;
    throw refusal(body, response.status);
  }
}

/** The error for a response that was not a success, in the server's own words when it gave any. */
function refusal(body: unknown, status: number): AdminRequestError {
  const error = typeof body === 'object' && body !== null && 'error' in body ? (body.error as Record<string, unknown> | null) : null;
  const message = typeof error?.['message'] === 'string' ? error['message'] : `The server answered with an error (${status}). Try again in a moment.`;
  const code = typeof error?.['code'] === 'string' && CODES.has(error['code']) ? (error['code'] as RequestErrorCode) : 'unknown';
  return new AdminRequestError(message, code, Array.isArray(error?.['issues']) ? (error['issues'] as RequestIssue[]) : []);
}
