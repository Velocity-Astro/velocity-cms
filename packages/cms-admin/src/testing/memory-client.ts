import type { ContentTypeDef, Entry, Page } from '@velocity/cms-core';
import type { AdminClient, EntryListQuery, SessionUser } from '../client/admin-client.js';

export interface MemoryAdminClientOptions {
  /** Who is signed in at the start. Leave out to start signed out. */
  readonly user?: SessionUser;
  /** Who a passkey signs in. Leave out to make passkeys fail. */
  readonly passkeyUser?: SessionUser;
  readonly contentTypes?: readonly ContentTypeDef[];
  readonly entries?: readonly Entry[];
}

/**
 * An `AdminClient` that keeps everything in memory. It stands in for the server in tests and in
 * the development preview, and records what the screens asked for.
 */
export class MemoryAdminClient implements AdminClient {
  /** Every address a sign-in link was asked for, in order. */
  readonly linkRequests: string[] = [];
  /** Set to make the next request fail with this message. */
  failNextWith: string | null = null;

  #user: SessionUser | null;
  readonly #passkeyUser: SessionUser | null;
  readonly #contentTypes: readonly ContentTypeDef[];
  readonly #entries: readonly Entry[];

  constructor(options: MemoryAdminClientOptions = {}) {
    this.#user = options.user ?? null;
    this.#passkeyUser = options.passkeyUser ?? null;
    this.#contentTypes = options.contentTypes ?? [];
    this.#entries = options.entries ?? [];
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

  async listContentTypes(): Promise<readonly ContentTypeDef[]> {
    this.#requireSession();
    return [...this.#contentTypes].sort((a, b) => a.key.localeCompare(b.key));
  }

  async listEntries(query: EntryListQuery): Promise<Page<Entry>> {
    this.#requireSession();
    const type = this.#contentTypes.find((candidate) => candidate.key === query.type);
    const matching = this.#entries
      .filter((entry) => entry.typeId === type?.id && (query.locale === undefined || entry.locale === query.locale))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const offset = query.offset ?? 0;
    return { items: matching.slice(offset, offset + (query.limit ?? 50)), total: matching.length };
  }

  #requireSession(): void {
    this.#failIfAsked();
    if (!this.#user) throw new Error('Sign in to continue.');
  }

  #failIfAsked(): void {
    const message = this.failNextWith;
    this.failNextWith = null;
    if (message !== null) throw new Error(message);
  }
}
