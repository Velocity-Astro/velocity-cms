import type { z } from 'zod';
import type { FieldDef, Timestamp } from './model.js';
import type { IdGenerator } from './ports.js';
import type { Registry } from './registry.js';

/**
 * How strictly to validate. A draft may leave required fields empty; publishing may not.
 */
export type ValidationMode = 'draft' | 'publish';

/** What a field type may use while building a schema or converting a value. */
export interface FieldContext {
  /** Every registered field type, for types that contain other fields. */
  readonly fields: Registry<FieldType>;
  readonly mode: ValidationMode;
}

/** What a field type may use while its settings are being stored. */
export interface DefineContext {
  readonly fields: Registry<FieldType>;
  readonly ids: IdGenerator;
  /** The time of the change, for a type that marks what a description no longer has. */
  readonly now: Timestamp;
}

/**
 * One kind of field: text, number, gallery, or a plugin's own.
 *
 * A field type knows how to validate, store and present its own value, so adding one never means
 * editing a switch statement somewhere else. Subclass it, then register an instance:
 *
 * ```ts
 * class RatingField extends FieldType<number, { max: number }> {
 *   readonly type = 'rating';
 *   readonly editor = 'rating-input';
 *   readonly options = z.object({ max: z.number().int().positive().default(5) });
 *   schema({ max }: { max: number }) {
 *     return z.number().int().min(1).max(max);
 *   }
 * }
 * cms.fields.register(new RatingField());
 * ```
 */
export abstract class FieldType<TValue = unknown, TOptions extends object = object> {
  /** The name a `FieldDef` refers to. */
  abstract readonly type: string;

  /** The editor component that renders this field, by name. */
  abstract readonly editor: string;

  /** Validates and fills defaults for this type's settings in a `FieldDef`. */
  abstract readonly options: z.ZodType<TOptions>;

  /** The schema for one value, given the field's settings. */
  abstract schema(options: TOptions, context: FieldContext): z.ZodType<TValue>;

  /**
   * The value as the site receives it. Stored values are keyed by field id wherever a field holds
   * other fields; the site wants field keys. Override when the type contains other fields.
   */
  toPublic(value: TValue, _options: TOptions, _context: FieldContext): unknown {
    return value;
  }

  /**
   * The settings as they are stored, given the settings as someone described them and the ones
   * stored before, if the field existed. A type that holds other fields gives each a permanent
   * id here, keeping the id of any field that was already there under the same key.
   */
  define(described: Readonly<Record<string, unknown>>, _previous: Readonly<Record<string, unknown>> | undefined, _context: DefineContext): Readonly<Record<string, unknown>> {
    return described;
  }

  /**
   * Whether a visitor can fill this in on a form of the site. Only plain values qualify: a form
   * never takes markup, a link into the site or anything that holds other fields.
   */
  get takesSubmissions(): boolean {
    return false;
  }

  /**
   * The value from what a form on the site sent, which is text unless a script sent more. An
   * answer of `undefined` means nothing was given. The schema still judges what comes back.
   */
  fromSubmitted(raw: unknown, _options: TOptions): unknown {
    if (typeof raw !== 'string') return raw ?? undefined;
    const text = raw.trim();
    return text === '' ? undefined : text;
  }

  /** The fields this type holds, for a type that holds fields. A list asks the type of its items. */
  inner(_options: Readonly<Record<string, unknown>>, _fields?: Registry<FieldType>): readonly FieldDef[] {
    return [];
  }

  /**
   * The settings with other fields in place of the ones it holds, or `null` for a type that
   * holds none. It is how a field inside a group is added, changed or removed.
   */
  withInner(_options: Readonly<Record<string, unknown>>, _inner: readonly FieldDef[], _fields?: Registry<FieldType>): Readonly<Record<string, unknown>> | null {
    return null;
  }
}
