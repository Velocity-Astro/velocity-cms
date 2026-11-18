/**
 * What the core needs from the outside world. The core ships no implementation of these:
 * an adapter package implements each one and proves it with the contract tests in `./testing`.
 */
import type { ContentTypeDef, Entry, EntryStatus, MediaFile, Page, Revision, SiteImage, Timestamp } from './model.js';

export interface EntryQuery {
  readonly typeId?: string;
  readonly locale?: string;
  readonly status?: EntryStatus;
  /** The slug of the version being worked on. */
  readonly slug?: string;
  /** The slug visitors see. Matches published entries only. */
  readonly publishedSlug?: string;
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
   */
  save(entry: Entry, options: SaveOptions): Promise<Entry>;
  /** Every saved version, newest first. */
  history(id: string): Promise<Revision[]>;
}

export interface SchemaRepository {
  get(id: string): Promise<ContentTypeDef | null>;
  getByKey(key: string): Promise<ContentTypeDef | null>;
  /** Content types ordered by key. */
  list(): Promise<ContentTypeDef[]>;
  /** Creates or replaces. Refuses, with a `ConflictError`, a key another type already uses. */
  save(type: ContentTypeDef): Promise<ContentTypeDef>;
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
