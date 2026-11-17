/**
 * Phase 0 prototype helpers. Rough on purpose: this is an experiment, not product code.
 * What it proves gets rebuilt properly in the packages.
 */
import { randomUUID } from 'node:crypto';
import { createCms } from '../../packages/cms-core/dist/index.js';
import { openDatabase, SqliteEntryRepository, SqliteSchemaRepository } from '../../packages/cms-db/dist/index.js';

export const OWNER = { kind: 'cli', id: 'prototype', role: 'owner' };

export async function openCms(url) {
  const database = await openDatabase({ url });
  const cms = createCms({
    entries: new SqliteEntryRepository(database.db),
    types: new SqliteSchemaRepository(database.db),
  });
  return { cms, close: () => database.close() };
}

/** Entry attributes in Velocity's JSON collections, which become columns, not fields. */
const ATTRIBUTES = new Set(['id', 'slug', 'locale']);

const label = (key) => ({ en: key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()) });

/** Works out a field type and its settings from every value a key takes across the samples. */
function inferType(values) {
  const sample = values.find((value) => value !== null && value !== undefined);
  if (typeof sample === 'number') return { type: 'number', options: {} };
  if (typeof sample === 'boolean') return { type: 'boolean', options: {} };
  if (Array.isArray(sample)) {
    const items = values.flatMap((value) => (Array.isArray(value) ? value : []));
    return { type: 'list', options: { of: items.length > 0 ? inferType(items) : { type: 'text', options: {} } } };
  }
  if (typeof sample === 'object') {
    return { type: 'group', options: { fields: inferFields(values.filter((value) => value && typeof value === 'object')) } };
  }
  return { type: 'text', options: {} };
}

/** Field definitions for a set of plain objects. Nested fields get their ids here. */
function inferFields(objects, { nested = true } = {}) {
  const keys = [...new Set(objects.flatMap((object) => Object.keys(object)))];
  return keys
    .filter((key) => nested || !ATTRIBUTES.has(key))
    .map((key) => {
      const values = objects.map((object) => object[key]);
      return {
        ...(nested && { id: randomUUID(), translated: false }),
        key,
        label: label(key),
        required: values.every((value) => value !== undefined && value !== null),
        ...inferType(values),
      };
    });
}

export const inferTopLevelFields = (objects) => inferFields(objects, { nested: false });

/** Re-keys a plain object from field keys to field ids, following groups and lists down. */
export function toStored(fields, object) {
  const stored = {};
  for (const field of fields) {
    if (field.deletedAt !== undefined) continue;
    const value = object[field.key];
    if (value === undefined || value === null) continue;
    stored[field.id] = convert(field.type, field.options, value);
  }
  return stored;
}

function convert(type, options, value) {
  if (type === 'group') return toStored(options.fields, value);
  if (type === 'list') return value.map((item) => convert(options.of.type, options.of.options ?? {}, item));
  return value;
}

/** Imports a Velocity JSON collection as a content type with published entries. */
export async function importCollection(cms, key, records) {
  const type = await cms.schema.create(OWNER, {
    key,
    kind: 'collection',
    label: label(key),
    fields: inferTopLevelFields(records),
  });
  await importRecords(cms, type, records);
  return type;
}

/** Imports the records of a Velocity JSON collection as published entries of a type that exists. */
export async function importRecords(cms, type, records) {
  const groups = new Map();
  for (const record of records) {
    // Velocity's JSON collections give every record the id `<locale>/<slug>`.
    const slug = record.slug ?? record.id.slice(record.id.indexOf('/') + 1);
    const group = groups.get(slug);
    const draft = await cms.content.create(OWNER, {
      typeId: type.id,
      locale: record.locale,
      slug,
      data: toStored(type.fields, record),
      ...(group && { translationGroup: group }),
    });
    groups.set(slug, draft.translationGroup);
    await cms.content.publish(OWNER, draft.id);
  }
  return type;
}

/** Copies of the records under new slugs, until there are `total`. Each copy keeps its languages together. */
export function multiply(records, total) {
  const bySlug = Map.groupBy(records, (record) => record.slug);
  const result = [...records];
  for (let copy = 1; result.length < total; copy++) {
    for (const [slug, versions] of bySlug) {
      if (result.length >= total) break;
      for (const version of versions) {
        result.push({
          ...version,
          id: `${version.locale}/${slug}-${copy}`,
          slug: `${slug}-${copy}`,
          path: `${version.path}-${copy}`,
          order: version.order + copy * 100,
          isNew: false,
        });
      }
    }
  }
  return result;
}
