import type { z } from 'zod';
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
}
