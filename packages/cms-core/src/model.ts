/**
 * The content model as plain, serialisable data.
 *
 * These are the objects stored in the database, exported to `cms/schema.json` and sent to the
 * editor. They carry no behaviour: anything that acts on them lives in a service or a field type.
 */

/** Text per locale, e.g. `{ en: 'Listings', es: 'Propiedades' }`. */
export type LocalizedText = Readonly<Record<string, string>>;

/** An ISO 8601 timestamp, e.g. `2026-11-17T19:00:00.000Z`. */
export type Timestamp = string;

export interface FieldDef {
  /** Permanent. Entry data is keyed by it, so renaming a field never loses data. */
  readonly id: string;
  /** The name code and templates use, e.g. `price`. Unique among a type's live fields. */
  readonly key: string;
  /** A registered field type: `text`, `number`, or a plugin's. */
  readonly type: string;
  readonly label: LocalizedText;
  /** A sentence under the field in the editor, on what to put in it. */
  readonly help?: LocalizedText;
  /** True when each language has its own value, false when all languages share one. */
  readonly translated: boolean;
  readonly required: boolean;
  /** Settings for the field type, validated by that type. */
  readonly options: Readonly<Record<string, unknown>>;
  /** Set when the field was removed. Its data is kept until the retention period ends. */
  readonly deletedAt?: Timestamp;
}

/** Fields the editor shows together under one heading, such as "Price and status". */
export interface FieldSection {
  /** Unique among a type's sections, e.g. `facts`. */
  readonly key: string;
  readonly label: LocalizedText;
  /** Top-level fields, in the order they are shown. */
  readonly fieldIds: readonly string[];
}

export type ContentTypeKind = 'collection' | 'single';

export interface ContentTypeDef {
  readonly id: string;
  /** The name code and URLs use, e.g. `listings`. */
  readonly key: string;
  readonly kind: ContentTypeKind;
  readonly label: LocalizedText;
  /** Where entries of this type live on the site, e.g. `/listings/[slug]`. */
  readonly urlPattern?: string;
  readonly fields: readonly FieldDef[];
  /**
   * The field an entry is called by in lists, as field ids from the top down: one id, or a
   * group's id and then a field inside it. Left out, the first text field is used.
   */
  readonly titlePath?: readonly string[];
  /** How the editor lays the fields out. A field in no section is shown after them. */
  readonly sections?: readonly FieldSection[];
}

export type EntryStatus = 'draft' | 'scheduled' | 'published';

/** Field values keyed by field id. */
export type EntryData = Readonly<Record<string, unknown>>;

/**
 * The version of an entry that visitors see. Saving the entry does not touch it; publishing
 * replaces it. That is what lets someone work on a published entry without the site changing.
 */
export interface PublishedVersion {
  readonly slug: string;
  readonly data: EntryData;
  /** The revision of the entry that was published. */
  readonly revision: number;
  readonly at: Timestamp;
}

export interface Entry {
  readonly id: string;
  readonly typeId: string;
  readonly locale: string;
  /** Shared by the versions of one entry in different languages. */
  readonly translationGroup: string;
  /** The entry's name in URLs, in the version being worked on. Unique per type and locale. */
  readonly slug: string;
  /** `published` exactly when `published` below is set. */
  readonly status: EntryStatus;
  /** The version being worked on. Visitors see `published.data`. */
  readonly data: EntryData;
  readonly published?: PublishedVersion;
  /** Starts at 1 and goes up by one on every save. */
  readonly revision: number;
  readonly publishAt?: Timestamp;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/** One saved version of an entry, as kept in its history. */
export interface Revision {
  readonly entryId: string;
  readonly revision: number;
  readonly status: EntryStatus;
  readonly data: EntryData;
  readonly actorId: string;
  readonly createdAt: Timestamp;
}

/** Whether the entry has been saved since it was last published. */
export function hasUnpublishedChanges(entry: Entry): boolean {
  return entry.published !== undefined && entry.published.revision !== entry.revision;
}

/** Which version of an entry to read: the one visitors see, or the one being worked on. */
export type EntryVersion = 'published' | 'working';

/** An entry as the site sees it, with values keyed by field key. */
export interface PublicEntry {
  readonly id: string;
  readonly slug: string;
  readonly locale: string;
  readonly translationGroup: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/** The live fields of a type or group: everything not removed. */
export function liveFields(fields: readonly FieldDef[]): FieldDef[] {
  return fields.filter((field) => field.deletedAt === undefined);
}
