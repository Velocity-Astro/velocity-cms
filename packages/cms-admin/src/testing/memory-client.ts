import { CmsError, ValidationError, createCms, type Actor, type Cms, type ContentTypeDef, type Entry, type Page } from '@velocity/cms-core';
import { InMemoryEntryRepository, InMemorySchemaRepository } from '@velocity/cms-core/in-memory';
import type { AdminClient, EntryChanges, EntryListQuery, FieldTypeInfo, NewEntry, SessionUser } from '../client/admin-client.js';
import { AdminRequestError, type RequestErrorCode } from '../client/errors.js';

export interface MemoryAdminClientOptions {
  /** Who is signed in at the start. Leave out to start signed out. */
  readonly user?: SessionUser;
  /** Who a passkey signs in. Leave out to make passkeys fail. */
  readonly passkeyUser?: SessionUser;
  readonly contentTypes?: readonly ContentTypeDef[];
  readonly entries?: readonly Entry[];
  /** The language new entries are written in. Defaults to `en`. */
  readonly defaultLocale?: string;
}

const KNOWN_CODES: ReadonlySet<string> = new Set<RequestErrorCode>(['validation_failed', 'conflict', 'not_found', 'forbidden']);

/**
 * An `AdminClient` with the real CMS behind it and nothing stored: the services and rules of
 * `cms-core`, over repositories that live in memory. It stands in for the server in tests and in
 * the development preview, so a screen that works here meets the same validation, the same
 * conflicts and the same publishing rules as on a site.
 */
export class MemoryAdminClient implements AdminClient {
  /** Every address a sign-in link was asked for, in order. */
  readonly linkRequests: string[] = [];
  /** Set to make the next request fail with this message. */
  failNextWith: string | null = null;

  #user: SessionUser | null;
  readonly #passkeyUser: SessionUser | null;
  readonly #defaultLocale: string;
  readonly #cms: Cms;
  /** Settles once the content given to the constructor is in place. Every request waits for it. */
  readonly #ready: Promise<void>;

  constructor(options: MemoryAdminClientOptions = {}) {
    this.#user = options.user ?? null;
    this.#passkeyUser = options.passkeyUser ?? null;
    this.#defaultLocale = options.defaultLocale ?? 'en';
    const types = new InMemorySchemaRepository();
    const entries = new InMemoryEntryRepository();
    this.#cms = createCms({ types, entries });
    this.#ready = (async () => {
      for (const type of options.contentTypes ?? []) await types.save(type);
      for (const entry of options.entries ?? []) await entries.save(entry, { expectedRevision: null, actorId: 'seed' });
    })();
  }

  async getSession(): Promise<SessionUser | null> {
    this.#failIfAsked();
    return this.#user;
  }

  async requestSignInLink(email: string): Promise<void> {
    this.#failIfAsked();
    this.linkRequests.push(email);
  }

  async signInWithPasskey(): Promise<SessionUser> {
    this.#failIfAsked();
    if (!this.#passkeyUser) throw new Error('No passkey was offered.');
    this.#user = this.#passkeyUser;
    return this.#user;
  }

  async signOut(): Promise<void> {
    this.#failIfAsked();
    this.#user = null;
  }

  listContentTypes(): Promise<readonly ContentTypeDef[]> {
    return this.#request(() => this.#cms.schema.list());
  }

  listFieldTypes(): Promise<readonly FieldTypeInfo[]> {
    return this.#request(async () => this.#cms.fields.list().map(({ type, editor }) => ({ type, editor })));
  }

  listEntries(query: EntryListQuery): Promise<Page<Entry>> {
    return this.#request(async (actor) => {
      const type = await this.#cms.schema.getByKey(query.type);
      const all = await this.#cms.content.find(actor, {
        typeId: type.id,
        limit: Number.MAX_SAFE_INTEGER,
        ...(query.locale !== undefined && { locale: query.locale }),
      });
      const newestFirst = [...all.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const offset = query.offset ?? 0;
      return { items: newestFirst.slice(offset, offset + (query.limit ?? 50)), total: all.total };
    });
  }

  getEntry(id: string): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.get(actor, id));
  }

  createEntry(entry: NewEntry): Promise<Entry> {
    return this.#request(async (actor) => {
      const type = await this.#cms.schema.getByKey(entry.type);
      return this.#cms.content.create(actor, {
        typeId: type.id,
        locale: entry.locale ?? this.#defaultLocale,
        slug: entry.slug,
        data: entry.data,
      });
    });
  }

  updateEntry(id: string, changes: EntryChanges): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.update(actor, id, changes));
  }

  publishEntry(id: string, expectedRevision: number): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.publish(actor, id, expectedRevision));
  }

  unpublishEntry(id: string): Promise<Entry> {
    return this.#request((actor) => this.#cms.content.unpublish(actor, id));
  }

  /** Runs one signed-in request against the CMS, and reports a refusal the way a server would. */
  async #request<T>(run: (actor: Actor) => Promise<T>): Promise<T> {
    this.#failIfAsked();
    if (!this.#user) throw new AdminRequestError('Sign in to continue.', 'forbidden');
    await this.#ready;
    try {
      return await run({ kind: 'user', id: this.#user.id, role: 'owner' });
    } catch (error) {
      if (!(error instanceof CmsError)) throw error;
      const code = KNOWN_CODES.has(error.code) ? (error.code as RequestErrorCode) : 'unknown';
      throw new AdminRequestError(error.message, code, error instanceof ValidationError ? error.issues : []);
    }
  }

  #failIfAsked(): void {
    const message = this.failNextWith;
    this.failNextWith = null;
    if (message !== null) throw new Error(message);
  }
}
