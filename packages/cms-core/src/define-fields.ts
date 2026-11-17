import { ConflictError, ValidationError } from './errors.js';
import type { DefineContext } from './field-type.js';
import { liveFields, type FieldDef, type LocalizedText } from './model.js';

/** A field as someone describes it. The CMS assigns the id. */
export interface NewField {
  readonly key: string;
  readonly type: string;
  readonly label: LocalizedText;
  readonly help?: LocalizedText;
  readonly translated?: boolean;
  readonly required?: boolean;
  /** Settings for the field type. A group's `fields` and a list's `of` are described the same way. */
  readonly options?: Readonly<Record<string, unknown>>;
}

const KEY = /^[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*$/;

/** Refuses a key that code and templates could not use. */
export function requireKey(key: string, what: string): void {
  if (!KEY.test(key)) {
    throw new ValidationError(
      `"${key}" can't be used as a ${what} key. Start with a lowercase letter and use letters, numbers and single hyphens.`,
      [{ path: ['key'], message: 'Invalid key' }],
    );
  }
}

/**
 * One field as it is stored. `previous` is the field that already has this key, if there is
 * one: its id is kept, so the content saved under it is still there.
 */
export function defineField(input: NewField, previous: FieldDef | undefined, context: DefineContext): FieldDef {
  requireKey(input.key, 'field');
  const type = context.fields.get(input.type);
  const described = input.options ?? {};
  const options = type.options.safeParse(described);
  if (!options.success) {
    throw new ValidationError(
      `The settings for field "${input.key}" are not valid for a ${input.type} field.`,
      options.error.issues.map((issue) => ({
        path: issue.path.map((segment) => (typeof segment === 'symbol' ? String(segment) : segment)),
        message: issue.message,
      })),
    );
  }
  const given = (input as { id?: unknown }).id;
  return {
    id: previous?.id ?? (typeof given === 'string' ? given : context.ids.next()),
    key: input.key,
    type: input.type,
    label: input.label,
    ...(input.help !== undefined && { help: input.help }),
    translated: input.translated ?? true,
    required: input.required ?? false,
    options: type.define(described, previous?.type === input.type ? previous.options : undefined, context),
  };
}

/**
 * Fields as they are stored, in the order described. A field already there under the same key
 * keeps its id. Fields that were there and are not described are kept as they were, after the
 * described ones, so describing a type again never loses content.
 */
export function defineFields(described: readonly NewField[], previous: readonly FieldDef[], context: DefineContext): FieldDef[] {
  const live = new Map(liveFields(previous).map((field) => [field.key, field]));
  const fields: FieldDef[] = [];
  for (const input of described) {
    if (fields.some((field) => field.key === input.key)) {
      throw new ConflictError(`This content type already has a field with the key "${input.key}".`);
    }
    fields.push(defineField(input, live.get(input.key), context));
  }
  const kept = new Set(fields.map((field) => field.id));
  return [...fields, ...previous.filter((field) => !kept.has(field.id))];
}
