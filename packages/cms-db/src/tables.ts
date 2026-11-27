import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { ContentTypeDef, EntryData, EntryStatus, FormDef, SubmissionStatus } from '@velocity-astro/cms-core';

/**
 * One row per content type. The definition is stored whole, as JSON: it is always read and
 * written as a unit, and its shape is owned by cms-core, not by this table.
 */
export const contentTypes = sqliteTable(
  'content_types',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    definition: text('definition', { mode: 'json' }).$type<ContentTypeDef>().notNull(),
  },
  (table) => [uniqueIndex('content_types_key').on(table.key)],
);

/**
 * One row per entry: the version being worked on, and beside it, in the `published_` columns, the
 * version visitors see. Those four are all set or all null.
 */
export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    typeId: text('type_id').notNull(),
    locale: text('locale').notNull(),
    translationGroup: text('translation_group').notNull(),
    slug: text('slug').notNull(),
    status: text('status').$type<EntryStatus>().notNull(),
    data: text('data', { mode: 'json' }).$type<EntryData>().notNull(),
    revision: integer('revision').notNull(),
    publishAt: text('publish_at'),
    /** Why it did not go on the site when its time came. */
    publishProblem: text('publish_problem'),
    publishedSlug: text('published_slug'),
    publishedData: text('published_data', { mode: 'json' }).$type<EntryData>(),
    publishedRevision: integer('published_revision'),
    publishedAt: text('published_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    /** Set while the entry is in the trash. */
    deletedAt: text('deleted_at'),
  },
  (table) => [
    // An entry in the trash holds no slug, so another entry may take it.
    uniqueIndex('entries_type_locale_slug').on(table.typeId, table.locale, table.slug).where(sql`${table.deletedAt} is null`),
    uniqueIndex('entries_type_locale_published_slug').on(table.typeId, table.locale, table.publishedSlug),
    index('entries_type_status').on(table.typeId, table.status),
    index('entries_translation_group').on(table.translationGroup),
  ],
);

/** Every saved version of every entry. Rows are only ever added. */
export const revisions = sqliteTable(
  'revisions',
  {
    entryId: text('entry_id').notNull(),
    revision: integer('revision').notNull(),
    status: text('status').$type<EntryStatus>().notNull(),
    data: text('data', { mode: 'json' }).$type<EntryData>().notNull(),
    actorId: text('actor_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.entryId, table.revision] })],
);

/** The record of every uploaded image. The files themselves are kept in a `MediaStore`. */
export const media = sqliteTable(
  'media',
  {
    name: text('name').primaryKey(),
    key: text('key').notNull(),
    contentType: text('content_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    size: integer('size').notNull(),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [uniqueIndex('media_key').on(table.key)],
);

/**
 * Small values kept per plugin: its settings, whether it is switched on, and what it stores
 * itself. `value` is JSON as text, written and read by the store, so `null` and `false` are
 * values like any other.
 */
export const pluginData = sqliteTable(
  'plugin_data',
  {
    plugin: text('plugin').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.plugin, table.key] })],
);

/**
 * One row per form. The definition is stored whole, as JSON, like a content type's. `revision`
 * and `deleted_at` are repeated beside it for the checks a save makes.
 */
export const forms = sqliteTable(
  'forms',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    revision: integer('revision').notNull(),
    definition: text('definition', { mode: 'json' }).$type<FormDef>().notNull(),
    deletedAt: text('deleted_at'),
  },
  // A form in the trash holds no key, so another form may take it.
  (table) => [uniqueIndex('forms_key').on(table.key).where(sql`${table.deletedAt} is null`)],
);

/** What visitors sent through forms. Personal data: read only through the submission service. */
export const formSubmissions = sqliteTable(
  'form_submissions',
  {
    id: text('id').primaryKey(),
    formId: text('form_id').notNull(),
    status: text('status').$type<SubmissionStatus>().notNull(),
    data: text('data', { mode: 'json' }).$type<EntryData>().notNull(),
    email: text('email'),
    locale: text('locale'),
    page: text('page'),
    /** The entry whose own page it was sent from: its content type and its translation group. */
    aboutType: text('about_type'),
    aboutEntry: text('about_entry'),
    createdAt: text('created_at').notNull(),
    handledAt: text('handled_at'),
    handledBy: text('handled_by'),
  },
  (table) => [
    index('form_submissions_form_created').on(table.formId, table.createdAt),
    index('form_submissions_email').on(table.email),
  ],
);

/** The people who wrote to the site. Personal data: read only through the contact service. */
export const contacts = sqliteTable(
  'contacts',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name'),
    phone: text('phone'),
    sourceFormId: text('source_form_id'),
    sourcePage: text('source_page'),
    // Whoever wrote in before there was a pipeline starts where a new contact does.
    stage: text('stage').notNull().default('new'),
    ownerId: text('owner_id'),
    followUpAt: text('follow_up_at'),
    // What the site's own fields hold, by field id.
    data: text('data', { mode: 'json' }).$type<EntryData>(),
    revision: integer('revision').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('contacts_email').on(table.email),
    index('contacts_created').on(table.createdAt),
    index('contacts_stage').on(table.stage, table.createdAt),
    index('contacts_follow_up').on(table.followUpAt),
  ],
);

/** What contacts may buy. As personal as its contact: read only through the deal service. */
export const deals = sqliteTable(
  'deals',
  {
    id: text('id').primaryKey(),
    contactId: text('contact_id').notNull(),
    title: text('title').notNull(),
    aboutType: text('about_type'),
    aboutEntry: text('about_entry'),
    value: integer('value').notNull(),
    stage: text('stage').notNull(),
    ownerId: text('owner_id'),
    closeOn: text('close_on'),
    closedAt: text('closed_at'),
    data: text('data', { mode: 'json' }).$type<EntryData>(),
    revision: integer('revision').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('deals_contact').on(table.contactId), index('deals_stage').on(table.stage, table.createdAt), index('deals_about').on(table.aboutEntry)],
);

/**
 * Who is at which entry now: a person with it open in the editor, or an agent that just worked on
 * it. One row for each of them at each entry, of no use once `until` has passed, and cleared away then.
 */
export const entryPresence = sqliteTable(
  'entry_presence',
  {
    entryId: text('entry_id').notNull(),
    actorId: text('actor_id').notNull(),
    kind: text('kind').$type<'user' | 'agent'>().notNull(),
    name: text('name').notNull(),
    until: text('until').notNull(),
    /** Where in the entry they are, when their editor said. */
    at: text('at'),
    /** For an agent in a person's own session: that person's id. */
    of: text('of'),
  },
  (table) => [primaryKey({ columns: [table.entryId, table.actorId] }), index('entry_presence_until').on(table.until)],
);

/**
 * What visitors liked: one row for each browser that liked an entry, by the entry's type and
 * translation group. `visitor` is a hash the site made with its secret, so nothing here says who
 * anyone is. Counted with `group by`, which the key on all three keeps quick.
 */
export const entryLikes = sqliteTable(
  'entry_like',
  {
    typeId: text('type_id').notNull(),
    entry: text('entry').notNull(),
    visitor: text('visitor').notNull(),
    at: text('at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.typeId, table.entry, table.visitor] }), index('entry_like_at').on(table.at)],
);

/**
 * Small things a site keeps one of, each stored whole as JSON under its name: the pipeline's
 * stages today. `revision` is repeated beside it for the check a save makes.
 */
export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  revision: integer('revision').notNull(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
});

/** What the team wrote down about a contact. */
export const contactNotes = sqliteTable(
  'contact_notes',
  {
    id: text('id').primaryKey(),
    contactId: text('contact_id').notNull(),
    text: text('text').notNull(),
    /** Set on the record of a move to another stage: the stage left and the stage reached. */
    movedFrom: text('moved_from'),
    movedTo: text('moved_to'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('contact_notes_contact').on(table.contactId, table.createdAt)],
);
