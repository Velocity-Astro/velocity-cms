import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { ContentTypeDef, EntryData, EntryStatus } from '@velocity/cms-core';

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

/** The current version of every entry. */
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
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('entries_type_locale_slug').on(table.typeId, table.locale, table.slug),
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
