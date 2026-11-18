/**
 * What the core needs from the outside world. The core ships no implementation of these:
 * an adapter package implements each one and proves it with the contract tests in `./testing`.
 */
import type { ContentTypeDef, Entry, EntryStatus, FormDef, MediaFile, Page, Revision, SiteImage, Submission, SubmissionStatus, Timestamp, Contact, ContactNote, Deal, DealSubject, Pipeline, TeamMember, CustomFields } from './model.js';

export interface EntryQuery {
  readonly typeId?: string;
  readonly locale?: string;
  readonly status?: EntryStatus;
  /** The versions of one entry in its languages. */
  readonly translationGroup?: string;
  /** The slug of the version being worked on. */
  readonly slug?: string;
  /** The slug visitors see. Matches published entries only. */
  readonly publishedSlug?: string;
  /** Entries set to be published at this time or before it. */
  readonly dueBy?: Timestamp;
  /** `true` for the entries in the trash and no others. Left out, the trash is left out. */
  readonly trashed?: boolean;
  /**
   * `created` (the default) is oldest first, which never reorders as people work. `updated` is
   * most recently saved first, which is what an editor's list shows.
   */
  readonly order?: 'created' | 'updated';
  /** Defaults to 50. */
  readonly limit?: number;
  readonly offset?: number;
}

export interface SaveOptions {
  /**
   * The revision the caller last saw, or `null` for a new entry. The save is refused with a
   * `ConflictError` if the stored entry has moved on, so nobody overwrites another person's work.
   */
  readonly expectedRevision: number | null;
  readonly actorId: string;
}

export interface EntryRepository {
  get(id: string): Promise<Entry | null>;
  /** Entries in the order the query asks for, then by id, so paging never skips or repeats one. */
  find(query?: EntryQuery): Promise<Page<Entry>>;
  /**
   * Stores the entry and adds it to its history, as one step. Also refuses, with a
   * `ConflictError`, a slug another entry of the same type and locale already uses, whether in
   * the version being worked on or in the published one: two pages can never share an address.
   * An entry in the trash holds no slug: it neither refuses another's nor is refused.
   */
  save(entry: Entry, options: SaveOptions): Promise<Entry>;
  /** Every saved version, newest first. */
  history(id: string): Promise<Revision[]>;
  /** Removes the entry and its history for good. An id nothing has is ignored. */
  remove(id: string): Promise<void>;
}

export interface SchemaRepository {
  get(id: string): Promise<ContentTypeDef | null>;
  getByKey(key: string): Promise<ContentTypeDef | null>;
  /** Content types ordered by key. */
  list(): Promise<ContentTypeDef[]>;
  /** Creates or replaces. Refuses, with a `ConflictError`, a key another type already uses. */
  save(type: ContentTypeDef): Promise<ContentTypeDef>;
}

export interface FormRepository {
  get(id: string): Promise<FormDef | null>;
  /** The form with this key that is not in the trash. */
  getByKey(key: string): Promise<FormDef | null>;
  /** Forms ordered by key: those outside the trash, or with `trashed` only those in it. */
  list(options?: { readonly trashed?: boolean }): Promise<FormDef[]>;
  /**
   * Creates or replaces. `expectedRevision` is the revision the caller last saw, or `null` for a
   * new form: a form that has moved on is refused with a `ConflictError`, and so is a key another
   * form outside the trash already uses. A form in the trash holds no key.
   */
  save(form: FormDef, expectedRevision: number | null): Promise<FormDef>;
  /** Removes the form for good. Its submissions are the caller's to remove. An id nothing has is ignored. */
  remove(id: string): Promise<void>;
}

export interface SubmissionQuery {
  readonly formId?: string;
  readonly status?: SubmissionStatus;
  /** The sender's email, in lower case. */
  readonly email?: string;
  /** Only submissions that arrived before this time. */
  readonly before?: Timestamp;
  /** Defaults to 50. */
  readonly limit?: number;
  readonly offset?: number;
}

export interface SubmissionRepository {
  get(id: string): Promise<Submission | null>;
  /** Newest first, then by id, so paging never skips or repeats one. */
  find(query?: SubmissionQuery): Promise<Page<Submission>>;
  /** How many of a form's submissions have each status. */
  counts(formId: string): Promise<Readonly<Record<SubmissionStatus, number>>>;
  /** Adds a submission. Refuses, with a `ConflictError`, an id another already has. */
  add(submission: Submission): Promise<Submission>;
  /** Replaces a submission that exists. One that does not is ignored. */
  update(submission: Submission): Promise<void>;
  /** Removes submissions for good. Ids nothing has are ignored. */
  remove(ids: readonly string[]): Promise<void>;
  /** Removes every submission of a form for good. */
  removeOfForm(formId: string): Promise<void>;
}

export interface ContactQuery {
  /** Words to find in the name, email or phone, whatever their case. */
  readonly search?: string;
  /** Only contacts in this stage. */
  readonly stage?: string;
  /** Only contacts this person looks after, or with `null`, the ones nobody does. */
  readonly ownerId?: string | null;
  /**
   * Only contacts to get back to on or before this day (`2026-03-14`). They come soonest first
   * rather than newest first.
   */
  readonly followUpBy?: string;
  /** Defaults to 50. */
  readonly limit?: number;
  readonly offset?: number;
}

export interface ContactRepository {
  get(id: string): Promise<Contact | null>;
  /** The contact with this email, given in lower case. */
  getByEmail(email: string): Promise<Contact | null>;
  /** Newest first, then by id, so paging never skips or repeats one. */
  find(query?: ContactQuery): Promise<Page<Contact>>;
  /** Puts every contact of one stage in another, as it is. Answers with how many moved. */
  moveStage(from: string, to: string): Promise<number>;
  /**
   * Creates or replaces. `expectedRevision` is the revision the caller last saw, or `null` for a
   * new contact: one that has moved on is refused with a `ConflictError`, and so is an email
   * another contact has.
   */
  save(contact: Contact, expectedRevision: number | null): Promise<Contact>;
  /** Removes the contact and its notes for good. An id nothing has is ignored. */
  remove(id: string): Promise<void>;
  /** A contact's notes, newest first, then by id. */
  notes(contactId: string): Promise<ContactNote[]>;
  /** Adds a note. Refuses, with a `ConflictError`, an id another already has. */
  addNote(note: ContactNote): Promise<ContactNote>;
  /** Removes one note of a contact. An id nothing has is ignored. */
  removeNote(contactId: string, noteId: string): Promise<void>;
}

export interface DealQuery {
  readonly contactId?: string;
  readonly stage?: string;
  /** Only deals this person looks after, or with `null`, the ones nobody does. */
  readonly ownerId?: string | null;
  /** Only deals about this entry. */
  readonly about?: DealSubject;
  /** Defaults to 50. */
  readonly limit?: number;
  readonly offset?: number;
}

/** How many deals a stage holds, and what they are worth together. */
export interface StageTotal {
  readonly stage: string;
  readonly count: number;
  readonly value: number;
}

export interface DealRepository {
  get(id: string): Promise<Deal | null>;
  /** Newest first, then by id, so paging never skips or repeats one. */
  find(query?: DealQuery): Promise<Page<Deal>>;
  /** One total for each stage that holds a deal. */
  totals(): Promise<StageTotal[]>;
  /**
   * Creates or replaces. `expectedRevision` is the revision the caller last saw, or `null` for a
   * new deal: one that has moved on is refused with a `ConflictError`.
   */
  save(deal: Deal, expectedRevision: number | null): Promise<Deal>;
  /** Puts every deal of one stage in another, as it is. Answers with how many moved. */
  moveStage(from: string, to: string): Promise<number>;
  /** Removes a deal for good. An id nothing has is ignored. */
  remove(id: string): Promise<void>;
  /** Removes every deal of a contact for good. Answers with how many went. */
  removeOfContact(contactId: string): Promise<number>;
}

/** Where the site's pipeline is kept, once someone has changed the one the CMS comes with. */
export interface PipelineStore {
  /** The pipeline as it was saved, or `null` when nobody has changed it. */
  get(): Promise<Pipeline | null>;
  /**
   * Replaces it. `expectedRevision` is the revision the caller last saw, or `null` when none was
   * saved before: one that has moved on is refused with a `ConflictError`.
   */
  save(pipeline: Pipeline, expectedRevision: number | null): Promise<Pipeline>;
}

/** Where the fields a site adds to its contacts and deals are kept. */
export interface CustomFieldsStore {
  /** The fields as they were saved, or `null` when none ever were. */
  get(): Promise<CustomFields | null>;
  /**
   * Replaces them. `expectedRevision` is the revision the caller last saw, or `null` when none
   * were saved before: fields that have moved on are refused with a `ConflictError`.
   */
  save(fields: CustomFields, expectedRevision: number | null): Promise<CustomFields>;
}

/** Who is on the team. Sign-in belongs to the host, so the host says. */
export interface Team {
  /** Everyone who can sign in, by name. */
  members(): Promise<TeamMember[]>;
}

/** The current time. Passed in so tests can fix it. */
export interface Clock {
  now(): Timestamp;
}

/** Makes ids for new content types, fields and entries. Passed in so tests can predict them. */
export interface IdGenerator {
  next(): string;
}

/** One searchable thing: usually a page of the site, as a visitor reads it. */
export interface SearchDocument {
  /** Unique and stable. Putting a document with the same id replaces the old one. */
  readonly id: string;
  readonly locale: string;
  readonly url: string;
  readonly title: string;
  /** Plain text, no markup. */
  readonly body: string;
}

export interface SearchQuery {
  /** What the visitor typed. Any text is safe; the last word also matches as a beginning. */
  readonly text: string;
  readonly locale?: string;
  /** Defaults to 10. */
  readonly limit?: number;
}

export interface SearchHit {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  /** A passage of the body, HTML-escaped, with the matched words inside `<mark>`. */
  readonly excerpt: string;
}

export interface SearchResults {
  /** How many documents match, which can be more than `hits`. */
  readonly total: number;
  /** Best match first. A match in the title counts for more than one in the body. */
  readonly hits: readonly SearchHit[];
}

/**
 * Full-text search over published content. A publish changes only the documents it touched, so
 * search is as fresh as the page.
 */
export interface SearchIndex {
  put(documents: readonly SearchDocument[]): Promise<void>;
  /** Ids that are not in the index are ignored. */
  remove(ids: readonly string[]): Promise<void>;
  /** Every document matches all the words, whatever their case or accents. */
  search(query: SearchQuery): Promise<SearchResults>;
  count(): Promise<number>;
}

/**
 * The images a site has to choose from: a folder in the project today, an uploads library later.
 * The site tells the CMS about them, since only the site knows where its images are.
 */
export interface ImageLibrary {
  /** Every image, ordered by name. */
  list(): Promise<readonly SiteImage[]>;
}

/**
 * Small values kept per plugin: its settings, whether it is switched on, and whatever it chooses
 * to keep itself. One plugin can never read another's: every call names whose value it is.
 */
export interface PluginStore {
  /** The value as it was set, or `undefined` when nothing is there. */
  get(plugin: string, key: string): Promise<unknown>;
  /** Sets a value, replacing what was there. Anything JSON can hold. */
  set(plugin: string, key: string, value: unknown): Promise<void>;
  /** Takes a value away. A key nothing is under is ignored. */
  remove(plugin: string, key: string): Promise<void>;
  /** One plugin's values whose key starts with `prefix`, as key and value, ordered by key. */
  list(plugin: string, prefix: string): Promise<[string, unknown][]>;
}

/**
 * Looks a host's name up and answers with every numeric address it leads to. A site that can
 * look names up gives one, so nothing a plugin sends reaches a private machine behind a public
 * name. It throws when the name leads nowhere.
 */
export type NameLookup = (host: string) => Promise<readonly string[]>;

/** The records of uploaded images. */
export interface MediaRepository {
  /** Every upload, ordered by name. */
  list(): Promise<MediaFile[]>;
  get(name: string): Promise<MediaFile | null>;
  /** Adds a record. Refuses, with a `ConflictError`, a name or a key another upload already has. */
  add(file: MediaFile): Promise<MediaFile>;
  /** Removes a record. A name nothing has is ignored. */
  remove(name: string): Promise<void>;
}

/** A file as a store hands it back. */
export interface StoredFile {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/**
 * Where uploaded files are kept: a folder on a server that has a disk, a bucket on a host that
 * does not. A key is a file name with no folders in it, and is never reused for another file.
 */
export interface MediaStore {
  put(key: string, file: StoredFile): Promise<void>;
  /** The file, or `null` when nothing is kept under the key. */
  get(key: string): Promise<StoredFile | null>;
  /** Removes a file. A key nothing is kept under is ignored. */
  remove(key: string): Promise<void>;
}
