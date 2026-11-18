import type { ContentTypeDef, Entry, EntryData, Page, SiteImage } from '@velocity/cms-core';

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

/** Which editor control a field type is filled in with. */
export interface FieldTypeInfo {
  /** The field type's name, as a `FieldDef` refers to it: `text`. */
  readonly type: string;
  /** The name of its control: `text-input`. */
  readonly editor: string;
}

export interface NewEntry {
  /** The content type's key, e.g. `listings`. */
  readonly type: string;
  /** Left out, the entry is written in the site's default language. */
  readonly locale?: string;
  readonly slug: string;
  /** Field values keyed by field id. */
  readonly data: EntryData;
}

export interface EntryChanges {
  readonly slug: string;
  /** Every field value, keyed by field id. A field left out is emptied. */
  readonly data: EntryData;
  /** The revision that was loaded. The save is refused if someone else saved in between. */
  readonly expectedRevision: number;
}

/**
 * Everything the editor asks of the server. The screens know only this interface: the real
 * implementation talks to the CMS over HTTP, and `MemoryAdminClient` in `./testing` stands in
 * for it in tests and in the development preview.
 *
 * A method that fails rejects with an `Error` whose message can be shown to the person. When the
 * server refused the request, it is an `AdminRequestError`, which also says why.
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
  /** Every field type the site has, built in or from a plugin, with the control that edits it. */
  listFieldTypes(): Promise<readonly FieldTypeInfo[]>;
  /** The site's images, ordered by name, for an image field to choose from. */
  listImages(): Promise<readonly SiteImage[]>;
  getEntry(id: string): Promise<Entry>;
  /** Creates a draft. Required fields may still be empty: they are checked on publish. */
  createEntry(entry: NewEntry): Promise<Entry>;
  /** Saves the version being worked on. What visitors see does not change. */
  updateEntry(id: string, changes: EntryChanges): Promise<Entry>;
  /** Makes the saved version the one visitors see. Refused while a required field is empty. */
  publishEntry(id: string, expectedRevision: number): Promise<Entry>;
  /** Takes the entry off the site. Its content is kept as a draft. */
  unpublishEntry(id: string): Promise<Entry>;
}
