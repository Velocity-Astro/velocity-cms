import { ConflictError } from '../errors.js';
import type { ContentTypeDef, Entry, MediaFile, Page, Revision, SiteImage } from '../model.js';
import type {
  Clock,
  EntryQuery,
  EntryRepository,
  IdGenerator,
  ImageLibrary,
  MediaRepository,
  PluginStore,
  MediaStore,
  SaveOptions,
  SchemaRepository,
  SearchDocument,
  SearchIndex,
  SearchQuery,
  SearchResults,
  StoredFile,
} from '../ports.js';
import { MARK_CLOSE, MARK_OPEN, markedExcerpt, searchWords } from '../search-text.js';

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
          (query.status === undefined || entry.status === query.status) &&
          (query.slug === undefined || entry.slug === query.slug) &&
          (query.publishedSlug === undefined || entry.published?.slug === query.publishedSlug),
      )
      .sort((a, b) =>
        query.order === 'updated'
          ? b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
          : a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
    const offset = query.offset ?? 0;
    return { items: matches.slice(offset, offset + (query.limit ?? 50)), total: matches.length };
  }

  async save(entry: Entry, options: SaveOptions): Promise<Entry> {
    const stored = this.#entries.get(entry.id);
    if ((stored?.revision ?? null) !== options.expectedRevision) {
      throw new ConflictError(`Entry "${entry.id}" changed since it was read.`);
    }
    const mine = [entry.slug, entry.published?.slug];
    for (const other of this.#entries.values()) {
      if (other.id === entry.id || other.typeId !== entry.typeId || other.locale !== entry.locale) continue;
      const taken = mine.find((slug) => slug !== undefined && (slug === other.slug || slug === other.published?.slug));
      if (taken !== undefined) {
        throw new ConflictError(`Another entry already uses the slug "${taken}" in ${entry.locale}.`);
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

/** Searches documents kept in memory. For unit tests and examples: slow on purpose, and simple. */
export class InMemorySearchIndex implements SearchIndex {
  readonly #documents = new Map<string, SearchDocument>();

  async put(documents: readonly SearchDocument[]): Promise<void> {
    for (const document of documents) this.#documents.set(document.id, document);
  }

  async remove(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.#documents.delete(id);
  }

  async count(): Promise<number> {
    return this.#documents.size;
  }

  async search(query: SearchQuery): Promise<SearchResults> {
    const wanted = searchWords(query.text);
    if (wanted.length === 0) return { total: 0, hits: [] };
    const last = wanted.length - 1;
    const matches = (word: string, index: number, found: string) => (index === last ? found.startsWith(word) : found === word);
    const has = (words: string[]) => wanted.every((word, index) => words.some((found) => matches(word, index, found)));

    const scored = [...this.#documents.values()]
      .filter((document) => query.locale === undefined || document.locale === query.locale)
      .map((document) => ({ document, inTitle: has(searchWords(document.title)) }))
      .filter(({ document, inTitle }) => inTitle || has(searchWords(`${document.title} ${document.body}`)))
      .sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || a.document.id.localeCompare(b.document.id));

    const hits = scored.slice(0, query.limit ?? 10).map(({ document }) => ({
      id: document.id,
      url: document.url,
      title: document.title,
      excerpt: markedExcerpt(
        document.body.replace(/[\p{L}\p{N}]+/gu, (found) =>
          wanted.some((word, index) => matches(word, index, searchWords(found)[0] ?? '')) ? `${MARK_OPEN}${found}${MARK_CLOSE}` : found,
        ),
      ),
    }));
    return { total: scored.length, hits };
  }
}

/** A fixed set of images. */
export class InMemoryImageLibrary implements ImageLibrary {
  constructor(private readonly images: readonly SiteImage[] = []) {}

  async list(): Promise<readonly SiteImage[]> {
    return this.images;
  }
}

export class InMemoryMediaRepository implements MediaRepository {
  readonly #files = new Map<string, MediaFile>();

  async list(): Promise<MediaFile[]> {
    return [...this.#files.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(name: string): Promise<MediaFile | null> {
    return this.#files.get(name) ?? null;
  }

  async add(file: MediaFile): Promise<MediaFile> {
    for (const other of this.#files.values()) {
      if (other.name === file.name || other.key === file.key) {
        throw new ConflictError(`Another image is already called "${file.name}".`);
      }
    }
    this.#files.set(file.name, file);
    return file;
  }

  async remove(name: string): Promise<void> {
    this.#files.delete(name);
  }
}

/** Keeps files in memory. */
export class InMemoryMediaStore implements MediaStore {
  readonly #files = new Map<string, StoredFile>();

  async put(key: string, file: StoredFile): Promise<void> {
    this.#files.set(key, { bytes: file.bytes.slice(), contentType: file.contentType });
  }

  async get(key: string): Promise<StoredFile | null> {
    return this.#files.get(key) ?? null;
  }

  async remove(key: string): Promise<void> {
    this.#files.delete(key);
  }
}

const bytesOf = (...parts: (number[] | string)[]): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((letter) => letter.charCodeAt(0)) : part)));
const be = (value: number, length: number): number[] =>
  Array.from({ length }, (_, index) => (value >>> (8 * (length - 1 - index))) & 0xff);

/** The start of a PNG of the given size: enough to be recognised, not a picture. For tests. */
export const tinyPng = (width = 4, height = 3): Uint8Array<ArrayBuffer> =>
  bytesOf([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], be(13, 4), 'IHDR', be(width, 4), be(height, 4), [8, 6, 0, 0, 0]);

/** The start of a JPEG of the given size. For tests. */
export const tinyJpeg = (width = 4, height = 3): Uint8Array<ArrayBuffer> =>
  bytesOf([0xff, 0xd8, 0xff, 0xe0], be(16, 2), 'JFIF', new Array<number>(10).fill(0), [0xff, 0xc0], be(17, 2), [8], be(height, 2), be(width, 2), new Array<number>(12).fill(0));

export class InMemoryPluginStore implements PluginStore {
  readonly #values = new Map<string, string>();

  async get(plugin: string, key: string): Promise<unknown> {
    const stored = this.#values.get(JSON.stringify([plugin, key]));
    return stored === undefined ? undefined : (JSON.parse(stored) as unknown);
  }

  async set(plugin: string, key: string, value: unknown): Promise<void> {
    // Kept as text, as a database would keep it, so nobody holds a value they can change in place.
    this.#values.set(JSON.stringify([plugin, key]), JSON.stringify(value));
  }

  async remove(plugin: string, key: string): Promise<void> {
    this.#values.delete(JSON.stringify([plugin, key]));
  }

  async list(plugin: string, prefix: string): Promise<[string, unknown][]> {
    return [...this.#values]
      .map(([at, value]) => [JSON.parse(at) as [string, string], value] as const)
      .filter(([[owner, key]]) => owner === plugin && key.startsWith(prefix))
      .map(([[, key], value]): [string, unknown] => [key, JSON.parse(value) as unknown])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }
}
