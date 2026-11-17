import type { ContentTypeDef, Entry, Page } from '@velocity/cms-core';

/** The person who is signed in. */
export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface EntryListQuery {
  /** The content type's key, e.g. `listings`. */
  readonly type: string;
  readonly locale?: string;
  /** Defaults to 50. */
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Everything the editor asks of the server. The screens know only this interface: the real
 * implementation talks to the CMS over HTTP, and `MemoryAdminClient` in `./testing` stands in
 * for it in tests and in the development preview.
 *
 * A method that fails rejects with an `Error` whose message can be shown to the person.
 */
export interface AdminClient {
  /** Who is signed in, or `null`. */
  getSession(): Promise<SessionUser | null>;
  /**
   * Emails a sign-in link. Resolves the same way whether or not the address belongs to someone,
   * so the screen cannot be used to find out who has an account.
   */
  requestSignInLink(email: string): Promise<void>;
  /** Asks the browser for a passkey and signs in with it. */
  signInWithPasskey(): Promise<SessionUser>;
  signOut(): Promise<void>;
  /** Content types ordered by key. */
  listContentTypes(): Promise<readonly ContentTypeDef[]>;
  /** The working versions of a type's entries, newest first. */
  listEntries(query: EntryListQuery): Promise<Page<Entry>>;
}
