import type { ContentTypeChanges, ContentTypeDef, ContentTypeKind, Entry, EntryData, FieldArrangement, FieldChanges, LocalizedText, NewField, NewUpload, Page, PreviewLink, Role, SiteImage } from '@velocity/cms-core';

/** The person who is signed in. */
export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  /** What they may do. The screens use it to leave out what the server would refuse anyway. */
  readonly role: Role;
}

/** Someone who can sign in to the editor. */
export type Person = SessionUser;

export interface NewPerson {
  readonly email: string;
  readonly name: string;
  readonly role: Role;
}

/** A content type as someone starts it: fields are added afterwards, one at a time. */
export interface NewType {
  /** The name code and addresses use, e.g. `testimonials`. It cannot be changed later. */
  readonly key: string;
  readonly kind: ContentTypeKind;
  readonly label: LocalizedText;
  /** Where its entries live on the site, e.g. `/news/[slug]`. Left out, it has no page of its own. */
  readonly urlPattern?: string;
}

/** A field as someone adds it, and the section that shows it, by key. */
export interface NewTypeField extends NewField {
  readonly section?: string;
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

/** The images an image field chooses from, and whether the site takes new ones. */
export interface ImageList {
  /** Ordered by name. */
  readonly items: readonly SiteImage[];
  /** `null` when the site has nowhere to keep uploads. */
  readonly upload: { /** The largest file the site takes, in bytes. */ readonly maxBytes: number } | null;
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
  /** Starts a content type with no fields. Owners only, like every change to a content type. */
  createContentType(type: NewType): Promise<ContentTypeDef>;
  /** Changes what a content type is called, or where its entries live. */
  updateContentType(id: string, changes: ContentTypeChanges): Promise<ContentTypeDef>;
  /** Adds a field to a content type. Refused when a field already has its key. */
  addField(typeId: string, field: NewTypeField): Promise<ContentTypeDef>;
  /** Changes a field in place. Its content stays. */
  changeField(typeId: string, fieldId: string, changes: FieldChanges): Promise<ContentTypeDef>;
  /** Hides a field from the editor and the site. Its content is kept, so it can be restored. */
  removeField(typeId: string, fieldId: string): Promise<ContentTypeDef>;
  /** Brings a removed field back, with its content. */
  restoreField(typeId: string, fieldId: string): Promise<ContentTypeDef>;
  /** Puts a type's fields in order, and says which section shows which. */
  arrangeFields(typeId: string, arrangement: FieldArrangement): Promise<ContentTypeDef>;
  /** The working versions of a type's entries, newest first. */
  listEntries(query: EntryListQuery): Promise<Page<Entry>>;
  /** Every field type the site has, built in or from a plugin, with the control that edits it. */
  listFieldTypes(): Promise<readonly FieldTypeInfo[]>;
  /** The site's images, for an image field to choose from, and whether more can be uploaded. */
  listImages(): Promise<ImageList>;
  /** Adds an image. Refused unless the file is a JPEG, PNG or WebP the site has room for. */
  uploadImage(upload: NewUpload): Promise<SiteImage>;
  getEntry(id: string): Promise<Entry>;
  /** Creates a draft. Required fields may still be empty: they are checked on publish. */
  createEntry(entry: NewEntry): Promise<Entry>;
  /** Saves the version being worked on. What visitors see does not change. */
  updateEntry(id: string, changes: EntryChanges): Promise<Entry>;
  /** Makes the saved version the one visitors see. Refused while a required field is empty. */
  publishEntry(id: string, expectedRevision: number): Promise<Entry>;
  /** Takes the entry off the site. Its content is kept as a draft. */
  unpublishEntry(id: string): Promise<Entry>;
  /**
   * A link to the entry's page showing the saved draft, good for a while. Refused when its type
   * has no page of its own, or the site makes no previews.
   */
  previewEntry(id: string): Promise<PreviewLink>;
  /** Everyone who can sign in, by name. Owners only, like every method about people. */
  listPeople(): Promise<readonly Person[]>;
  /** Lets someone in, and emails them a link. Refused for an address that is already here. */
  invitePerson(person: NewPerson): Promise<Person>;
  /** Changes what someone may do. Refused when it would leave the site without an owner. */
  changePersonRole(id: string, role: Role): Promise<Person>;
  /** Takes away someone's access at once. Refused for yourself and for the last owner. */
  removePerson(id: string): Promise<void>;
  /** Asks the browser to make a passkey for the signed-in person, called `name` in their list. */
  addPasskey(name: string): Promise<void>;
}
