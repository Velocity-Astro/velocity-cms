import { z } from 'zod';
import { defineFields, type NewField } from '../define-fields.js';
import { FieldType, type DefineContext, type FieldContext } from '../field-type.js';
import type { FieldDef } from '../model.js';
import { Registry } from '../registry.js';
import { fromPlainText, richTextHtml, richTextParagraphs, richTextSchema, type RichText } from '../rich-text.js';
import { buildFieldsSchema, toPublicData } from '../schema-builder.js';
import { BlocksField } from './blocks.js';

export { BlocksField, defineBlock, type NewBlock } from './blocks.js';

const noOptions = z.object({});
type NoOptions = z.infer<typeof noOptions>;

export class TextField extends FieldType<string, { maxLength?: number | undefined; multiline: boolean }> {
  readonly type = 'text';
  readonly editor = 'text-input';
  readonly options = z.object({
    maxLength: z.number().int().positive().optional(),
    multiline: z.boolean().default(false),
  });

  schema({ maxLength }: { maxLength?: number | undefined }) {
    return maxLength ? z.string().max(maxLength) : z.string();
  }
}

export class NumberField extends FieldType<
  number,
  { min?: number | undefined; max?: number | undefined; integer: boolean }
> {
  readonly type = 'number';
  readonly editor = 'number-input';
  readonly options = z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    integer: z.boolean().default(false),
  });

  schema({ min, max, integer }: { min?: number | undefined; max?: number | undefined; integer: boolean }) {
    let schema = integer ? z.number().int() : z.number();
    if (min !== undefined) schema = schema.min(min);
    if (max !== undefined) schema = schema.max(max);
    return schema;
  }
}

export class BooleanField extends FieldType<boolean, NoOptions> {
  readonly type = 'boolean';
  readonly editor = 'switch';
  readonly options = noOptions;

  schema() {
    return z.boolean();
  }
}

/** A calendar date, stored as `YYYY-MM-DD`. */
export class DateField extends FieldType<string, NoOptions> {
  readonly type = 'date';
  readonly editor = 'date-picker';
  readonly options = noOptions;

  schema() {
    return z.iso.date();
  }
}

export class UrlField extends FieldType<string, NoOptions> {
  readonly type = 'url';
  readonly editor = 'url-input';
  readonly options = noOptions;

  schema() {
    return z.url();
  }
}

/** One choice from a fixed list. */
export class SelectField extends FieldType<string, { choices: string[]; labels?: Record<string, Record<string, string>> | undefined }> {
  readonly type = 'select';
  readonly editor = 'select';
  readonly options = z.object({
    /** The values that are stored. */
    choices: z.array(z.string()).min(1),
    /** What the editor calls each choice, per language: `{ 'coming-soon': { en: 'Coming soon' } }`. */
    labels: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  });

  schema({ choices }: { choices: string[] }) {
    return z.enum(choices as [string, ...string[]]);
  }
}

/**
 * A link to an entry of another content type, such as a listing's agent.
 *
 * It stores the entry's slug, which every language of that entry shares and which a site's
 * pages already look entries up by. A slug that is changed later leaves the link pointing at
 * nothing, so the editor shows a link it cannot find instead of hiding it.
 */
export class ReferenceField extends FieldType<string, { to: string }> {
  readonly type = 'reference';
  readonly editor = 'reference';
  readonly options = z.object({
    /** The key of the content type the link points into, e.g. `agents`. */
    to: z.string().min(1),
  });

  schema() {
    return z.string().min(1);
  }
}

/**
 * One of the site's images, such as a listing's photo.
 *
 * It stores the image's name, which is what the site's pages look images up by. The editor shows
 * the picture and offers the site's images to choose from.
 */
export class ImageField extends FieldType<string, NoOptions> {
  readonly type = 'image';
  readonly editor = 'image';
  readonly options = noOptions;

  schema() {
    return z.string().min(1);
  }
}

/** Formatted text as the site receives it. */
export interface PublicRichText {
  /** Ready to show: every word in it is escaped. */
  readonly html: string;
  /** The words alone, one entry per paragraph, heading or list item. */
  readonly paragraphs: readonly string[];
}

/**
 * Text with headings, lists, bold, italics and links. Stored as a tree, never as HTML, and given
 * to the site as HTML made from that tree. A field that was plain text, or a list of
 * paragraphs, can be changed to this type: what is stored is read as paragraphs.
 */
export class RichTextField extends FieldType<RichText, NoOptions> {
  readonly type = 'richtext';
  readonly editor = 'rich-text';
  readonly options = noOptions;

  schema() {
    return richTextSchema;
  }

  override toPublic(value: RichText | string | readonly string[]): PublicRichText {
    // What was saved before the field became rich text is still plain.
    const text = typeof value === 'string' || Array.isArray(value) ? fromPlainText(value as string | readonly string[]) : (value as RichText);
    return { html: richTextHtml(text), paragraphs: richTextParagraphs(text) };
  }
}

/** The settings of a field that holds other fields. */
const fieldDefs = z.custom<FieldDef[]>((value) => Array.isArray(value), 'Expected a list of fields');

/** Several fields kept together as one value, such as an address. */
export class GroupField extends FieldType<Record<string, unknown>, { fields: FieldDef[] }> {
  readonly type = 'group';
  readonly editor = 'group';
  readonly options = z.object({ fields: fieldDefs });

  schema({ fields }: { fields: FieldDef[] }, context: FieldContext) {
    return buildFieldsSchema(fields, context);
  }

  override toPublic(value: Record<string, unknown>, { fields }: { fields: FieldDef[] }, context: FieldContext) {
    return toPublicData(fields, value, context);
  }

  override define(described: Readonly<Record<string, unknown>>, previous: Readonly<Record<string, unknown>> | undefined, context: DefineContext) {
    const before = Array.isArray(previous?.['fields']) ? (previous['fields'] as FieldDef[]) : [];
    return { ...described, fields: defineFields(described['fields'] as NewField[], before, context) };
  }

  override inner(options: Readonly<Record<string, unknown>>): readonly FieldDef[] {
    return Array.isArray(options['fields']) ? (options['fields'] as FieldDef[]) : [];
  }

  override withInner(options: Readonly<Record<string, unknown>>, inner: readonly FieldDef[]) {
    return { ...options, fields: [...inner] };
  }
}

interface ListOptions {
  /** What each item is: a field type and its settings. */
  of: { type: string; options: Record<string, unknown> };
  min?: number | undefined;
  max?: number | undefined;
}

/** An ordered list of values that all have the same field type. */
export class ListField extends FieldType<unknown[], ListOptions> {
  readonly type = 'list';
  readonly editor = 'list';
  readonly options = z.object({
    of: z.object({ type: z.string(), options: z.record(z.string(), z.unknown()).default({}) }),
    min: z.number().int().min(0).optional(),
    max: z.number().int().positive().optional(),
  });

  schema({ of, min, max }: ListOptions, context: FieldContext) {
    const item = context.fields.get(of.type);
    let schema = z.array(item.schema(item.options.parse(of.options), context));
    if (min !== undefined) schema = schema.min(min);
    if (max !== undefined) schema = schema.max(max);
    return schema;
  }

  override toPublic(value: unknown[], { of }: ListOptions, context: FieldContext) {
    if (!context.fields.has(of.type)) return value;
    const item = context.fields.get(of.type);
    const options = item.options.parse(of.options);
    return value.map((entry) => item.toPublic(entry, options, context));
  }

  override define(described: Readonly<Record<string, unknown>>, previous: Readonly<Record<string, unknown>> | undefined, context: DefineContext) {
    const of = described['of'] as { type: string; options?: Record<string, unknown> };
    const before = previous?.['of'] as { type: string; options?: Record<string, unknown> } | undefined;
    const item = context.fields.get(of.type);
    return { ...described, of: { type: of.type, options: item.define(of.options ?? {}, before?.type === of.type ? before.options : undefined, context) } };
  }

  /** A list of groups holds the fields of its items. */
  override inner(options: Readonly<Record<string, unknown>>, fields?: Registry<FieldType>): readonly FieldDef[] {
    const of = options['of'] as { type: string; options?: Record<string, unknown> } | undefined;
    return of && fields?.has(of.type) ? fields.get(of.type).inner(of.options ?? {}, fields) : [];
  }

  override withInner(options: Readonly<Record<string, unknown>>, inner: readonly FieldDef[], fields?: Registry<FieldType>) {
    const of = options['of'] as { type: string; options?: Record<string, unknown> } | undefined;
    const held = of && fields?.has(of.type) ? fields.get(of.type).withInner(of.options ?? {}, inner, fields) : null;
    return of && held ? { ...options, of: { type: of.type, options: held } } : null;
  }
}

/** A registry holding the field types every site has. Templates and plugins add to it. */
export function createFieldRegistry(): Registry<FieldType> {
  return new Registry<FieldType>('field type')
    .register(new TextField())
    .register(new NumberField())
    .register(new BooleanField())
    .register(new DateField())
    .register(new UrlField())
    .register(new SelectField())
    .register(new ReferenceField())
    .register(new ImageField())
    .register(new RichTextField())
    .register(new GroupField())
    .register(new ListField())
    .register(new BlocksField());
}
