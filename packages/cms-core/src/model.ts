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
  /** True for a section shown beside the content, with its address and status: order, references. */
  readonly aside?: boolean;
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
  /**
   * The same for the other languages, by locale: `{ es: '/es/propiedades/[slug]' }`. A language
   * left out has no page of its own that the CMS knows of.
   */
  readonly localizedUrlPatterns?: Readonly<Record<string, string>>;
  readonly fields: readonly FieldDef[];
  /**
   * The field an entry is called by in lists, as field ids from the top down: one id, or a
   * group's id and then a field inside it. Left out, the first text field is used.
   */
  readonly titlePath?: readonly string[];
  /** What a list of entries shows beside each entry's name. */
  readonly list?: ListSummary;
  /** How the editor lays the fields out. A field in no section is shown after them. */
  readonly sections?: readonly FieldSection[];
  /**
   * Set when the type was archived: it is out of the editor and its pages are off the site. Its
   * fields and entries are kept as they were, so restoring it brings everything back.
   */
  readonly deletedAt?: Timestamp;
}

/** Whether a content type is in use: not archived. */
export function isLiveType(type: ContentTypeDef): boolean {
  return type.deletedAt === undefined;
}

/**
 * What a list of a type's entries shows beside each name. Each path is field ids from the top
 * down, like `titlePath`.
 */
export interface ListSummary {
  /** The image field whose picture goes before the name. For a list of images, the first is shown. */
  readonly imagePath?: readonly string[];
  /** The fields that get a column each, in order. */
  readonly fieldPaths?: readonly (readonly string[])[];
}

/**
 * One kind of section a page can be built from, such as a feature grid: a named set of fields.
 * The template describes it and has the component that draws it. It is stored in the settings
 * of the `blocks` field that allows it.
 */
export interface BlockDef {
  /** Permanent. A section says which block it is by this, so renaming a block never loses pages. */
  readonly id: string;
  /** The name the template's components are looked up by, e.g. `feature-grid`. */
  readonly key: string;
  readonly label: LocalizedText;
  /** A line in the picker on what the block is for. */
  readonly description?: LocalizedText;
  /** A Lucide icon name, for the picker. */
  readonly icon?: string;
  /** What the picker files it under, such as `Content`. */
  readonly group?: string;
  readonly fields: readonly FieldDef[];
  /**
   * Set when the template stopped describing the block. Sections made from it are kept in every
   * entry and left off the site, and describing it again brings them back.
   */
  readonly retiredAt?: Timestamp;
}

/** One section of a page as it is stored: which block, and that block's values by field id. */
export interface BlockValue {
  /** Permanent and unique in its field, so a section can be pointed at and followed through history. */
  readonly id: string;
  /** The id of its `BlockDef`. */
  readonly block: string;
  readonly data: EntryData;
  /** True for a section kept in the entry but left off the site. */
  readonly hidden?: true;
}

/** One section as the site reads it: the block's key, and its values by field key. */
export interface PublicBlock {
  readonly id: string;
  readonly block: string;
  readonly data: Readonly<Record<string, unknown>>;
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
  /**
   * Set while the entry is in the trash: it is off the site and out of every list but the trash,
   * and its slug is free for another entry. Restoring brings it back as a draft.
   */
  readonly deletedAt?: Timestamp;
}

/** Whether an entry is in the trash. */
export function isTrashed(entry: Entry): boolean {
  return entry.deletedAt !== undefined;
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

/** An image the site has, which an image field can point at. */
export interface SiteImage {
  /** What an image field stores, and what the site's pages look the image up by. */
  readonly name: string;
  /** Where a browser can load a small copy of it from. */
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
  /** Set for an image someone uploaded: when, and how large the file is in bytes. An image the site came with has neither, and cannot be removed here. */
  readonly uploadedAt?: Timestamp;
  readonly size?: number;
}

/** An image someone uploaded. The record says what the file is; the file itself is in a `MediaStore`. */
export interface MediaFile {
  /** What an image field stores. Unique among uploads, and made from the file's own name. */
  readonly name: string;
  /** What the file is kept and served under: the name with the ending of its kind, `kitchen.jpg`. */
  readonly key: string;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
  /** In bytes. */
  readonly size: number;
  readonly createdAt: Timestamp;
  /** The id of whoever uploaded it. */
  readonly createdBy: string;
}
