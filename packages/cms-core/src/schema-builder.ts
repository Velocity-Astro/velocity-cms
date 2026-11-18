import { z } from 'zod';
import { ValidationError, type ValidationIssue } from './errors.js';
import type { FieldContext } from './field-type.js';
import { liveFields, type EntryData, type FieldDef } from './model.js';

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
    path: readablePath(fields, issue.path),
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

/** Replaces field ids in an issue path with field keys, following groups and lists down. */
function readablePath(
  fields: readonly FieldDef[],
  path: readonly PropertyKey[],
): (string | number)[] {
  const readable: (string | number)[] = [];
  let scope: readonly FieldDef[] = fields;
  for (const segment of path) {
    if (typeof segment === 'number') {
      readable.push(segment);
      continue;
    }
    const field = scope.find((candidate) => candidate.id === segment);
    readable.push(field?.key ?? String(segment));
    scope = nestedFields(field);
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
