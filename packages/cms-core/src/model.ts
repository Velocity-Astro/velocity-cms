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
  /** True when each language has its own value, false when all languages share one. */
  readonly translated: boolean;
  readonly required: boolean;
  /** Settings for the field type, validated by that type. */
  readonly options: Readonly<Record<string, unknown>>;
  /** Set when the field was removed. Its data is kept until the retention period ends. */
  readonly deletedAt?: Timestamp;
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
}

export type EntryStatus = 'draft' | 'scheduled' | 'published';

/** Field values keyed by field id. */
export type EntryData = Readonly<Record<string, unknown>>;

export interface Entry {
  readonly id: string;
  readonly typeId: string;
  readonly locale: string;
  /** Shared by the versions of one entry in different languages. */
  readonly translationGroup: string;
  /** The entry's name in URLs. Unique per type and locale. */
  readonly slug: string;
  readonly status: EntryStatus;
  readonly data: EntryData;
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

/** An entry as the site sees it: published, with values keyed by field key. */
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
