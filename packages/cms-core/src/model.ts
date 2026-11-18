/**
 * The content model as plain, serialisable data.
 *
 * These are the objects stored in the database, exported to `cms/schema.json` and sent to the
 * editor. They carry no behaviour: anything that acts on them lives in a service or a field type.
 */

import type { Role } from './access.js';

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
   * Whether a deal can be about one of this type's entries: a listing, a membership, a service.
   * Left out, it cannot.
   */
  readonly forDeals?: true;
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

/**
 * A form visitors fill in on the site: its fields, what they see afterwards and who is told.
 * Its fields are `FieldDef`s like a content type's, so they are built and checked the same way.
 */
export interface FormDef {
  readonly id: string;
  /** The name templates and the site's pages use, e.g. `contact`. Unique among forms not in the trash. */
  readonly key: string;
  readonly label: LocalizedText;
  /** In the order a visitor meets them. A removed field is kept, marked, so old submissions still read. */
  readonly fields: readonly FieldDef[];
  /** The words on the button. Left out, the template's own. */
  readonly submitLabel?: LocalizedText;
  /** What a visitor is told once it is sent. Left out, the template's own. */
  readonly success?: LocalizedText;
  /** Who is emailed about each submission. */
  readonly notify: readonly string[];
  /** The ids of the fields that hold the sender's name, email and phone: what ties a submission to a person. */
  readonly contact?: FormContactFields;
  /** How many days a submission is kept. Left out, until someone deletes it. */
  readonly retentionDays?: number;
  /** False for a form that takes no submissions for now. */
  readonly open: boolean;
  /** Starts at 1 and goes up by one on every save. */
  readonly revision: number;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  /** Set while the form is in the trash: it takes no submissions and its key is free. */
  readonly deletedAt?: Timestamp;
}

export interface FormContactFields {
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
}

/** A form as the site reads it, to draw it: fields by key, removed ones left out. */
export interface PublicForm {
  readonly key: string;
  readonly label: LocalizedText;
  readonly fields: readonly PublicFormField[];
  readonly submitLabel?: LocalizedText;
  readonly success?: LocalizedText;
}

export interface PublicFormField {
  readonly key: string;
  readonly type: string;
  readonly label: LocalizedText;
  readonly help?: LocalizedText;
  readonly required: boolean;
  readonly options: Readonly<Record<string, unknown>>;
}

/** `spam` is a submission the checks suspected: kept apart, never dropped. */
export type SubmissionStatus = 'new' | 'handled' | 'spam';

/**
 * What one visitor sent through a form. It is personal data about someone who is not a user of
 * the CMS: it never reaches a page, the search index or a cache.
 */
export interface Submission {
  readonly id: string;
  readonly formId: string;
  readonly status: SubmissionStatus;
  /** The values by field id, checked against the form as it was when they arrived. */
  readonly data: EntryData;
  /** The sender's email in lower case, when the form marks a field as holding it. */
  readonly email?: string;
  /** The language of the page it was sent from. */
  readonly locale?: string;
  /** The path of the page it was sent from, e.g. `/contact/`. */
  readonly page?: string;
  readonly createdAt: Timestamp;
  readonly handledAt?: Timestamp;
  /** The id of whoever marked it handled. */
  readonly handledBy?: string;
}

/**
 * A person who wrote to the site, or whom the team added by hand. Personal data about someone
 * who is not a user of the CMS: read only through the contact service.
 */
export interface Contact {
  readonly id: string;
  /** In lower case. What makes two submissions the same person; no two contacts share one. */
  readonly email: string;
  readonly name?: string;
  readonly phone?: string;
  /** Where they first came from: the form they sent and the page it was on. Left out for one added by hand. */
  readonly source?: ContactSource;
  /** Where they stand: the id of a stage of the site's pipeline. */
  readonly stage: string;
  /** The id of the person on the team who looks after them. Left out while nobody does. */
  readonly ownerId?: string;
  /** The day to get back to them, as `2026-03-14`. Left out when nothing is planned. */
  readonly followUpAt?: string;
  /** What the site's own fields for contacts hold, by field id. See `CustomFields`. */
  readonly data?: EntryData;
  /** Starts at 1 and goes up by one on every save. */
  readonly revision: number;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/** Whether contacts in a stage are still being worked with, or the matter is settled one way or the other. */
/**
 * The fields a site adds to its contacts and its deals. Each has a permanent id, and a removed
 * one is marked `deletedAt` and its values are kept. `revision` 0 means none were ever saved.
 */
export interface CustomFields {
  readonly contact: readonly FieldDef[];
  readonly deal: readonly FieldDef[];
  readonly revision: number;
}

export type StageKind = 'open' | 'won' | 'lost';

/** One step of the pipeline, such as "Contacted". */
export interface PipelineStage {
  /** Permanent: contacts hold it. */
  readonly id: string;
  /** What the team called it. A stage the CMS came with has none until it is renamed, and the editor names it. */
  readonly label?: string;
  readonly kind: StageKind;
  /**
   * How likely a deal in this stage is to be won, from 0 to 100, for the forecast. Left out, an
   * open stage counts as 50. A won stage is always 100 and a lost one 0, whatever is here.
   */
  readonly chance?: number;
}

/** The steps a contact moves through, in order. The first is where a new contact starts, and is always open. */
export interface Pipeline {
  readonly stages: readonly PipelineStage[];
  /** The money deals are counted in, as an ISO 4217 code such as `USD`. Left out, `USD`. */
  readonly currency?: string;
  /**
   * Who a contact made by a form is given to: whichever of these people looks after the fewest
   * contacts. One id gives every new contact to that person. Left out or empty, nobody.
   */
  readonly assignTo?: readonly string[];
  /** 0 for the pipeline the CMS comes with, before anyone changed it; then up by one on every save. */
  readonly revision: number;
}

/**
 * Something a contact may buy, worth an amount, moving through the pipeline's stages. It belongs
 * to its contact: it is erased with them and exported with them.
 */
export interface Deal {
  readonly id: string;
  readonly contactId: string;
  /** What it is about: "Sale of 18 Alder Court". */
  readonly title: string;
  /** The entry of the site it is about, when it is about one. The title stays its own words. */
  readonly about?: DealSubject;
  /** What it is worth, in whole units of the pipeline's currency. */
  readonly value: number;
  /** The id of a stage of the pipeline. */
  readonly stage: string;
  /** The id of the person on the team who looks after it. */
  readonly ownerId?: string;
  /** The day it is expected to be settled, as `2026-03-14`. */
  readonly closeOn?: string;
  /** When it reached a won or lost stage. Left out while it is open. */
  readonly closedAt?: Timestamp;
  /** What the site's own fields for deals hold, by field id. See `CustomFields`. */
  readonly data?: EntryData;
  /** Starts at 1 and goes up by one on every save. */
  readonly revision: number;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/**
 * The entry a deal is about. Stored as the entry, never its name or address, so a rename changes
 * nothing; an entry that has since gone leaves the deal with its title.
 */
export interface DealSubject {
  /** The id of the entry's content type. */
  readonly typeId: string;
  /** The entry's translation group, which every language of it shares and which never changes. */
  readonly entry: string;
}

/** What one stage holds in deals. */
export interface StageForecast {
  readonly stage: string;
  readonly count: number;
  /** What the deals in it are worth together. */
  readonly value: number;
  /** That worth times the stage's chance, rounded to whole units. */
  readonly weighted: number;
}

/** Where the deals stand: what is open, what it is likely to bring, and what was won and lost. */
export interface Forecast {
  readonly currency: string;
  readonly stages: readonly StageForecast[];
  /** The worth of every deal in an open stage. */
  readonly open: number;
  /** The worth of the open deals, each counted by its stage's chance. */
  readonly weighted: number;
  readonly won: number;
  readonly lost: number;
}

/** Someone on the team, as far as assigning work to them needs. */
export interface TeamMember {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
}

export interface ContactSource {
  readonly formId: string;
  readonly page?: string;
}

/** Something the team wrote down about a contact. */
export interface ContactNote {
  readonly id: string;
  readonly contactId: string;
  readonly text: string;
  /** The id of whoever wrote it. */
  readonly createdBy: string;
  readonly createdAt: Timestamp;
}

/** One answer of a submission, with its field's key and label, for showing it to the team. */
export interface SubmissionAnswer {
  readonly key: string;
  readonly label: LocalizedText;
  readonly value: unknown;
}

/** One thing that happened with a contact: a form they sent, or a note the team wrote. */
export type TimelineItem =
  | { readonly kind: 'submission'; readonly at: Timestamp; readonly submission: Submission; readonly formLabel?: LocalizedText; readonly answers: readonly SubmissionAnswer[] }
  | { readonly kind: 'note'; readonly at: Timestamp; readonly note: ContactNote };
