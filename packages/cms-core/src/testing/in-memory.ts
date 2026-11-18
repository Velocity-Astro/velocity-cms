import { ConflictError } from '../errors.js';
import type { Contact, ContactNote, CustomFields, Deal, Pipeline, ContentTypeDef, Entry, FormDef, MediaFile, Page, Revision, SiteImage, Submission, SubmissionStatus } from '../model.js';
import type {
  Clock,
  ContactQuery,
  ContactRepository,
  DealQuery,
  DealRepository,
  StageTotal,
  PipelineStore,
  CustomFieldsStore,
  EntryQuery,
  EntryRepository,
  FormRepository,
  SubmissionQuery,
  SubmissionRepository,
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
          (entry.deletedAt !== undefined) === (query.trashed === true) &&
          (query.typeId === undefined || entry.typeId === query.typeId) &&
          (query.locale === undefined || entry.locale === query.locale) &&
          (query.status === undefined || entry.status === query.status) &&
          (query.translationGroup === undefined || entry.translationGroup === query.translationGroup) &&
          (query.dueBy === undefined || (entry.publishAt !== undefined && entry.publishAt <= query.dueBy)) &&
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
    for (const other of entry.deletedAt === undefined ? this.#entries.values() : []) {
      if (other.deletedAt !== undefined || other.id === entry.id || other.typeId !== entry.typeId || other.locale !== entry.locale) continue;
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

  async remove(id: string): Promise<void> {
    this.#entries.delete(id);
    this.#history.delete(id);
  }
}

export class InMemoryFormRepository implements FormRepository {
  readonly #forms = new Map<string, FormDef>();

  async get(id: string): Promise<FormDef | null> {
    return this.#forms.get(id) ?? null;
  }

  async getByKey(key: string): Promise<FormDef | null> {
    return [...this.#forms.values()].find((form) => form.key === key && form.deletedAt === undefined) ?? null;
  }

  async list(options: { readonly trashed?: boolean } = {}): Promise<FormDef[]> {
    return [...this.#forms.values()]
      .filter((form) => (form.deletedAt !== undefined) === (options.trashed === true))
      .sort((a, b) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
  }

  async save(form: FormDef, expectedRevision: number | null): Promise<FormDef> {
    if ((this.#forms.get(form.id)?.revision ?? null) !== expectedRevision) {
      throw new ConflictError(`Form "${form.id}" changed since it was read.`);
    }
    const other = form.deletedAt === undefined ? await this.getByKey(form.key) : null;
    if (other && other.id !== form.id) throw new ConflictError(`Another form already uses the key "${form.key}".`);
    this.#forms.set(form.id, form);
    return form;
  }

  async remove(id: string): Promise<void> {
    this.#forms.delete(id);
  }
}

export class InMemorySubmissionRepository implements SubmissionRepository {
  readonly #submissions = new Map<string, Submission>();

  async get(id: string): Promise<Submission | null> {
    return this.#submissions.get(id) ?? null;
  }

  async find(query: SubmissionQuery = {}): Promise<Page<Submission>> {
    const matches = [...this.#submissions.values()]
      .filter(
        (submission) =>
          (query.formId === undefined || submission.formId === query.formId) &&
          (query.status === undefined || submission.status === query.status) &&
          (query.email === undefined || submission.email === query.email) &&
          (query.before === undefined || submission.createdAt < query.before),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    const offset = query.offset ?? 0;
    return { items: matches.slice(offset, offset + (query.limit ?? 50)), total: matches.length };
  }

  async counts(formId: string): Promise<Readonly<Record<SubmissionStatus, number>>> {
    const counts = { new: 0, handled: 0, spam: 0 };
    for (const submission of this.#submissions.values()) if (submission.formId === formId) counts[submission.status] += 1;
    return counts;
  }

  async add(submission: Submission): Promise<Submission> {
    if (this.#submissions.has(submission.id)) throw new ConflictError(`Submission "${submission.id}" already exists.`);
    this.#submissions.set(submission.id, submission);
    return submission;
  }

  async update(submission: Submission): Promise<void> {
    if (this.#submissions.has(submission.id)) this.#submissions.set(submission.id, submission);
  }

  async remove(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.#submissions.delete(id);
  }

  async removeOfForm(formId: string): Promise<void> {
    for (const submission of [...this.#submissions.values()]) if (submission.formId === formId) this.#submissions.delete(submission.id);
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

  /** Moves the clock, for a test about something that happens later. */
  set(time: string): void {
    this.#time = Date.parse(time);
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

/** Keeps contacts and their notes in memory. */
export class InMemoryDealRepository implements DealRepository {
  readonly #deals = new Map<string, Deal>();

  async get(id: string): Promise<Deal | null> {
    return this.#deals.get(id) ?? null;
  }

  async find(query: DealQuery = {}): Promise<Page<Deal>> {
    const matches = [...this.#deals.values()]
      .filter((deal) => query.contactId === undefined || deal.contactId === query.contactId)
      .filter((deal) => query.stage === undefined || deal.stage === query.stage)
      .filter((deal) => query.ownerId === undefined || (deal.ownerId ?? null) === query.ownerId)
      .filter((deal) => query.about === undefined || (deal.about?.typeId === query.about.typeId && deal.about.entry === query.about.entry))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    const offset = query.offset ?? 0;
    return { items: matches.slice(offset, offset + (query.limit ?? 50)), total: matches.length };
  }

  async totals(): Promise<StageTotal[]> {
    const totals = new Map<string, StageTotal>();
    for (const deal of this.#deals.values()) {
      const so = totals.get(deal.stage) ?? { stage: deal.stage, count: 0, value: 0 };
      totals.set(deal.stage, { stage: deal.stage, count: so.count + 1, value: so.value + deal.value });
    }
    return [...totals.values()];
  }

  async save(deal: Deal, expectedRevision: number | null): Promise<Deal> {
    const current = this.#deals.get(deal.id);
    if ((current?.revision ?? null) !== expectedRevision) {
      throw new ConflictError(current ? 'This deal was saved by someone else. Reload it and try again.' : `Deal "${deal.id}" is not there to change.`);
    }
    this.#deals.set(deal.id, deal);
    return deal;
  }

  async moveStage(from: string, to: string): Promise<number> {
    const moving = [...this.#deals.values()].filter((deal) => deal.stage === from);
    for (const deal of moving) this.#deals.set(deal.id, { ...deal, stage: to });
    return moving.length;
  }

  async remove(id: string): Promise<void> {
    this.#deals.delete(id);
  }

  async removeOfContact(contactId: string): Promise<number> {
    const going = [...this.#deals.values()].filter((deal) => deal.contactId === contactId);
    for (const deal of going) this.#deals.delete(deal.id);
    return going.length;
  }
}

export class InMemoryPipelineStore implements PipelineStore {
  #pipeline: Pipeline | null = null;

  async get(): Promise<Pipeline | null> {
    return this.#pipeline;
  }

  async save(pipeline: Pipeline, expectedRevision: number | null): Promise<Pipeline> {
    if ((this.#pipeline?.revision ?? null) !== expectedRevision) throw new ConflictError('The stages were changed by someone else. Reload them and try again.');
    this.#pipeline = pipeline;
    return pipeline;
  }
}

export class InMemoryCustomFieldsStore implements CustomFieldsStore {
  #fields: CustomFields | null = null;

  async get(): Promise<CustomFields | null> {
    return this.#fields;
  }

  async save(fields: CustomFields, expectedRevision: number | null): Promise<CustomFields> {
    if ((this.#fields?.revision ?? null) !== expectedRevision) throw new ConflictError('These fields were changed by someone else. Reload them and try again.');
    this.#fields = fields;
    return fields;
  }
}

export class InMemoryContactRepository implements ContactRepository {
  readonly #contacts = new Map<string, Contact>();
  readonly #notes = new Map<string, ContactNote>();

  async get(id: string): Promise<Contact | null> {
    return this.#contacts.get(id) ?? null;
  }

  async getByEmail(email: string): Promise<Contact | null> {
    return [...this.#contacts.values()].find((contact) => contact.email === email) ?? null;
  }

  async find(query: ContactQuery = {}): Promise<Page<Contact>> {
    const words = (query.search ?? '').trim().toLowerCase();
    const matches = [...this.#contacts.values()]
      .filter((contact) => words === '' || [contact.name, contact.email, contact.phone].some((text) => text?.toLowerCase().includes(words)))
      .filter((contact) => query.stage === undefined || contact.stage === query.stage)
      .filter((contact) => query.ownerId === undefined || (contact.ownerId ?? null) === query.ownerId)
      .filter((contact) => query.followUpBy === undefined || (contact.followUpAt !== undefined && contact.followUpAt <= query.followUpBy))
      .sort((a, b) =>
        query.followUpBy === undefined
          ? b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
          : (a.followUpAt ?? '').localeCompare(b.followUpAt ?? '') || a.id.localeCompare(b.id),
      );
    const offset = query.offset ?? 0;
    return { items: matches.slice(offset, offset + (query.limit ?? 50)), total: matches.length };
  }

  async save(contact: Contact, expectedRevision: number | null): Promise<Contact> {
    const current = this.#contacts.get(contact.id);
    if ((current?.revision ?? null) !== expectedRevision) {
      throw new ConflictError(current ? 'This contact was saved by someone else. Reload it and try again.' : `Contact "${contact.id}" is not there to change.`);
    }
    const other = await this.getByEmail(contact.email);
    if (other && other.id !== contact.id) throw new ConflictError(`Another contact has the email "${contact.email}".`);
    this.#contacts.set(contact.id, contact);
    return contact;
  }

  async moveStage(from: string, to: string): Promise<number> {
    const moving = [...this.#contacts.values()].filter((contact) => contact.stage === from);
    for (const contact of moving) this.#contacts.set(contact.id, { ...contact, stage: to });
    return moving.length;
  }

  async remove(id: string): Promise<void> {
    this.#contacts.delete(id);
    for (const note of [...this.#notes.values()]) if (note.contactId === id) this.#notes.delete(note.id);
  }

  async notes(contactId: string): Promise<ContactNote[]> {
    return [...this.#notes.values()].filter((note) => note.contactId === contactId).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }

  async addNote(note: ContactNote): Promise<ContactNote> {
    if (this.#notes.has(note.id)) throw new ConflictError(`Note "${note.id}" already exists.`);
    this.#notes.set(note.id, note);
    return note;
  }

  async removeNote(contactId: string, noteId: string): Promise<void> {
    if (this.#notes.get(noteId)?.contactId === contactId) this.#notes.delete(noteId);
  }
}
