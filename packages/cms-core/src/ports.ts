/**
 * What the core needs from the outside world. The core ships no implementation of these:
 * an adapter package implements each one and proves it with the contract tests in `./testing`.
 */
import type { ContentTypeDef, Entry, EntryStatus, Page, Revision, Timestamp } from './model.js';

export interface EntryQuery {
  readonly typeId?: string;
  readonly locale?: string;
  readonly status?: EntryStatus;
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
  /** Entries ordered by creation time, then id. */
  find(query?: EntryQuery): Promise<Page<Entry>>;
  /**
   * Stores the entry and adds it to its history, as one step. Also refuses, with a
   * `ConflictError`, a slug another entry of the same type and locale already uses.
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
