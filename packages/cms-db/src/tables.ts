import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { ContentTypeDef, EntryData, EntryStatus, FormDef, SubmissionStatus } from '@velocity/cms-core';

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
    createdAt: text('created_at').notNull(),
    handledAt: text('handled_at'),
    handledBy: text('handled_by'),
  },
  (table) => [
    index('form_submissions_form_created').on(table.formId, table.createdAt),
    index('form_submissions_email').on(table.email),
  ],
);
