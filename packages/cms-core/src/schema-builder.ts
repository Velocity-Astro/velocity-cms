import { z } from 'zod';
import { ValidationError, type ValidationIssue } from './errors.js';
import type { FieldContext } from './field-type.js';
import { liveFields, type BlockDef, type EntryData, type FieldDef } from './model.js';

/**
 * The schema for a set of fields, keyed by field id.
 *
 * Used for a whole entry and for each group inside it. Removed fields are left out, so their
 * stored values are neither validated nor returned here.
 */
export function buildFieldsSchema(
  fields: readonly FieldDef[],
  context: FieldContext,
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of liveFields(fields)) {
    const type = context.fields.get(field.type);
    const schema = type.schema(type.options.parse(field.options), context);
    const mustBeSet = field.required && context.mode === 'publish';
    shape[field.id] = mustBeSet ? schema : schema.optional();
  }
  return z.object(shape);
}

/** Field values keyed by id, converted to the form the site reads: keyed by field key. */
export function toPublicData(
  fields: readonly FieldDef[],
  data: EntryData,
  context: FieldContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of liveFields(fields)) {
    const value = data[field.id];
    if (value === undefined) continue;
    // A site that runs older code than its database (a rollback, a deploy still on its way) meets
    // field types it has not heard of. Reading stays up: the value goes out as it is stored.
    if (!context.fields.has(field.type)) {
      result[field.key] = value;
      continue;
    }
    const type = context.fields.get(field.type);
    result[field.key] = type.toPublic(value, type.options.parse(field.options), context);
  }
  return result;
}

/**
 * Validates entry data and returns it cleaned, or throws a `ValidationError` whose issues name
 * fields by key, not id, so a person can act on them.
 */
export function validateData(
  fields: readonly FieldDef[],
  data: unknown,
  context: FieldContext,
): Record<string, unknown> {
  const result = buildFieldsSchema(fields, context).safeParse(data);
  if (result.success) return result.data;

  const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
    path: readablePath(fields, issue.path, data),
    // An empty required field is the commonest problem, and the schema's own words for it
    // ("expected string, received undefined") mean nothing to the person filling in the form.
    message: valueAt(data, issue.path) === undefined ? REQUIRED : issue.message,
  }));
  const first = issues[0];
  const where = first && first.path.length > 0 ? ` at "${first.path.join('.')}"` : '';
  throw new ValidationError(
    `${issues.length} problem${issues.length === 1 ? '' : 's'} in this entry, the first${where}: ${first?.message ?? 'invalid'}`,
    issues,
  );
}

const REQUIRED = 'Fill this in before publishing.';

/** The value an issue is about, found by following its path down through the data. */
function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let value = data;
  for (const segment of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<PropertyKey, unknown>)[segment];
  }
  return value;
}

/**
 * Replaces field ids in an issue path with field keys, following groups, lists and the sections
 * of a page down. A section's fields depend on which block it is, so the data is followed too.
 */
function readablePath(
  fields: readonly FieldDef[],
  path: readonly PropertyKey[],
  data: unknown,
): (string | number)[] {
  const readable: (string | number)[] = [];
  let scope: readonly FieldDef[] = fields;
  let blocks: readonly BlockDef[] | undefined;
  let value = data;
  for (const segment of path) {
    value = valueAt(value, [segment]);
    if (typeof segment === 'number') {
      readable.push(segment);
      if (blocks) scope = blocks.find((block) => block.id === (value as { block?: unknown } | undefined)?.block)?.fields ?? [];
      continue;
    }
    // Between a section and its values there is only `data`, which means nothing to a person.
    if (blocks && segment === 'data') {
      blocks = undefined;
      continue;
    }
    const field = scope.find((candidate) => candidate.id === segment);
    readable.push(field?.key ?? String(segment));
    scope = nestedFields(field);
    blocks = nestedBlocks(field);
  }
  return readable;
}

/** The fields inside a group, or inside the groups of a list. Empty for anything else. */
function nestedFields(field: FieldDef | undefined): readonly FieldDef[] {
  if (!field) return [];
  const options = field.options as { fields?: unknown; of?: { options?: { fields?: unknown } } };
  const candidate = options.fields ?? options.of?.options?.fields;
  return Array.isArray(candidate) ? (candidate as FieldDef[]) : [];
}

/** The blocks a field of sections allows. Nothing for any other field. */
function nestedBlocks(field: FieldDef | undefined): readonly BlockDef[] | undefined {
  const candidate = (field?.options as { blocks?: unknown } | undefined)?.blocks;
  return Array.isArray(candidate) ? (candidate as BlockDef[]) : undefined;
}

/**
 * Field values written by key, as a person writes sample content in code, turned into what an
 * entry stores: keyed by field id, down through groups, lists and the sections of a page. A
 * section names its block by key and is given an id by `newId` unless it has one. A key no field
 * has is refused, so a misspelt one is not silently dropped.
 */
export function toStoredData(fields: readonly FieldDef[], values: Readonly<Record<string, unknown>>, newId: () => string): EntryData {
  const live = liveFields(fields);
  const unknown = Object.keys(values).filter((key) => !live.some((field) => field.key === key));
  if (unknown.length > 0) {
    throw new ValidationError(`There is no field "${unknown[0] ?? ''}" here. The fields are: ${live.map((field) => field.key).join(', ')}.`, unknown.map((key) => ({ path: [key], message: 'No such field.' })));
  }
  const isValues = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
  const convert = (type: string, options: Readonly<Record<string, unknown>>, value: unknown): unknown => {
    if (type === 'group' && isValues(value)) return toStoredData((options['fields'] as FieldDef[] | undefined) ?? [], value, newId);
    if (type === 'list' && Array.isArray(value)) {
      const of = options['of'] as { type: string; options?: Record<string, unknown> } | undefined;
      return of ? value.map((item) => convert(of.type, of.options ?? {}, item)) : value;
    }
    if (type === 'blocks' && Array.isArray(value)) {
      const blocks = (options['blocks'] as BlockDef[] | undefined) ?? [];
      return value.filter(isValues).map((section) => {
        const block = blocks.find((candidate) => candidate.key === section['block']);
        if (!block) throw new ValidationError(`There is no block "${String(section['block'])}". The blocks are: ${blocks.map((candidate) => candidate.key).join(', ')}.`, [{ path: ['block'], message: 'No such block.' }]);
        return { id: typeof section['id'] === 'string' ? section['id'] : newId(), block: block.id, data: toStoredData(block.fields, isValues(section['data']) ? section['data'] : {}, newId), ...(section['hidden'] === true && { hidden: true }) };
      });
    }
    return value;
  };
  const stored: Record<string, unknown> = {};
  for (const field of live) {
    const value = values[field.key];
    if (value !== undefined && value !== null) stored[field.id] = convert(field.type, field.options, value);
  }
  return stored;
}

/**
 * What an entry stores, written back by key: the inverse of `toStoredData`, down through groups,
 * lists and the sections of a page. A section names its block by key and keeps its id, so the
 * values can be changed and handed back to `toStoredData` without a section losing its place.
 * Values are as stored (formatted text stays a tree), unlike `toPublicData`, which is for pages.
 * A removed field, and a section of a block no longer described, are left out.
 */
export function fromStoredData(fields: readonly FieldDef[], data: EntryData): Record<string, unknown> {
  const isValues = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
  const convert = (type: string, options: Readonly<Record<string, unknown>>, value: unknown): unknown => {
    if (type === 'group' && isValues(value)) return fromStoredData((options['fields'] as FieldDef[] | undefined) ?? [], value);
    if (type === 'list' && Array.isArray(value)) {
      const of = options['of'] as { type: string; options?: Record<string, unknown> } | undefined;
      return of ? value.map((item) => convert(of.type, of.options ?? {}, item)) : value;
    }
    if (type === 'blocks' && Array.isArray(value)) {
      const blocks = (options['blocks'] as BlockDef[] | undefined) ?? [];
      return value.filter(isValues).flatMap((section) => {
        const block = blocks.find((candidate) => candidate.id === section['block']);
        if (!block) return [];
        return [{ id: section['id'], block: block.key, data: fromStoredData(block.fields, isValues(section['data']) ? section['data'] : {}), ...(section['hidden'] === true && { hidden: true }) }];
      });
    }
    return value;
  };
  const values: Record<string, unknown> = {};
  for (const field of liveFields(fields)) {
    const value = data[field.id];
    if (value !== undefined) values[field.key] = convert(field.type, field.options, value);
  }
  return values;
}
