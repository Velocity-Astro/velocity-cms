import { ConflictError } from '../errors.js';
import type { ContentTypeDef, Entry, Page, Revision } from '../model.js';
import type { Clock, EntryQuery, EntryRepository, IdGenerator, SaveOptions, SchemaRepository } from '../ports.js';

/** Keeps entries in memory. For unit tests and examples: nothing survives a restart. */
export class InMemoryEntryRepository implements EntryRepository {
  readonly #entries = new Map<string, Entry>();
  readonly #history = new Map<string, Revision[]>();

  async get(id: string): Promise<Entry | null> {
    return this.#entries.get(id) ?? null;
  }

  async find(query: EntryQuery = {}): Promise<Page<Entry>> {
    const matches = [...this.#entries.values()]
      .filter(
        (entry) =>
          (query.typeId === undefined || entry.typeId === query.typeId) &&
          (query.locale === undefined || entry.locale === query.locale) &&
          (query.status === undefined || entry.status === query.status),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const offset = query.offset ?? 0;
    return { items: matches.slice(offset, offset + (query.limit ?? 50)), total: matches.length };
  }

  async save(entry: Entry, options: SaveOptions): Promise<Entry> {
    const stored = this.#entries.get(entry.id);
    if ((stored?.revision ?? null) !== options.expectedRevision) {
      throw new ConflictError(`Entry "${entry.id}" changed since it was read.`);
    }
    for (const other of this.#entries.values()) {
      if (
        other.id !== entry.id &&
        other.typeId === entry.typeId &&
        other.locale === entry.locale &&
        other.slug === entry.slug
      ) {
        throw new ConflictError(`Another entry already uses the slug "${entry.slug}" in ${entry.locale}.`);
      }
    }
    this.#entries.set(entry.id, entry);
    const revisions = this.#history.get(entry.id) ?? [];
    revisions.unshift({
      entryId: entry.id,
      revision: entry.revision,
      status: entry.status,
      data: entry.data,
      actorId: options.actorId,
      createdAt: entry.updatedAt,
    });
    this.#history.set(entry.id, revisions);
    return entry;
  }

  async history(id: string): Promise<Revision[]> {
    return [...(this.#history.get(id) ?? [])];
  }
}

export class InMemorySchemaRepository implements SchemaRepository {
  readonly #types = new Map<string, ContentTypeDef>();

  async get(id: string): Promise<ContentTypeDef | null> {
    return this.#types.get(id) ?? null;
  }

  async getByKey(key: string): Promise<ContentTypeDef | null> {
    return [...this.#types.values()].find((type) => type.key === key) ?? null;
  }

  async list(): Promise<ContentTypeDef[]> {
    return [...this.#types.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  async save(type: ContentTypeDef): Promise<ContentTypeDef> {
    const sameKey = await this.getByKey(type.key);
    if (sameKey && sameKey.id !== type.id) {
      throw new ConflictError(`A content type with the key "${type.key}" already exists.`);
    }
    this.#types.set(type.id, type);
    return type;
  }
}

/** A clock that moves forward one second each time it is read, starting from a fixed moment. */
export class FakeClock implements Clock {
  #time = Date.parse('2026-01-01T00:00:00.000Z');

  now(): string {
    const now = new Date(this.#time).toISOString();
    this.#time += 1000;
    return now;
  }
}

/** Ids that count up: `id-1`, `id-2`. */
export class SequentialIds implements IdGenerator {
  #next = 1;

  next(): string {
    return `id-${this.#next++}`;
  }
}
