import { z } from 'zod';
import { defineFields, type NewField } from '../define-fields.js';
import { FieldType, type DefineContext, type FieldContext } from '../field-type.js';
import type { FieldDef } from '../model.js';
import { Registry } from '../registry.js';
import { fromPlainText, limitRichText, RICH_TEXT_FORMATS, richTextHtml, richTextParagraphs, richTextSchema, type RichText, type RichTextFormat } from '../rich-text.js';
import { buildFieldsSchema, toPublicData } from '../schema-builder.js';
import { BlocksField } from './blocks.js';
import { LinkField } from './link.js';

export { BlocksField, defineBlock, type NewBlock } from './blocks.js';
export { LinkField, type AddressLink, type EntryLink, type LinkValue } from './link.js';

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

  override get takesSubmissions() {
    return true;
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

  override get takesSubmissions() {
    return true;
  }

  /** A number typed into a form arrives as text. Text that is no number is left for the schema to refuse. */
  override fromSubmitted(raw: unknown) {
    if (typeof raw !== 'string') return raw ?? undefined;
    const text = raw.trim();
    if (text === '') return undefined;
    const value = Number(text);
    return Number.isNaN(value) ? text : value;
  }
}

export class BooleanField extends FieldType<boolean, NoOptions> {
  readonly type = 'boolean';
  readonly editor = 'switch';
  readonly options = noOptions;

  schema() {
    return z.boolean();
  }

  override get takesSubmissions() {
    return true;
  }

  /** A tick arrives as `on`; a box left empty does not arrive at all, so a required one must be ticked. */
  override fromSubmitted(raw: unknown) {
    return raw === true || raw === 'on' || raw === 'true' ? true : undefined;
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

  override get takesSubmissions() {
    return true;
  }
}

export class UrlField extends FieldType<string, NoOptions> {
  readonly type = 'url';
  readonly editor = 'url-input';
  readonly options = noOptions;

  schema() {
    return z.url();
  }

  override get takesSubmissions() {
    return true;
  }
}

/** An email address, such as the one a visitor leaves to be answered at. */
export class EmailField extends FieldType<string, NoOptions> {
  readonly type = 'email';
  readonly editor = 'email-input';
  readonly options = noOptions;

  schema() {
    return z.email().max(254);
  }

  override get takesSubmissions() {
    return true;
  }
}

/** A phone number as it was typed: people write them in too many ways to hold to one. */
export class PhoneField extends FieldType<string, NoOptions> {
  readonly type = 'phone';
  readonly editor = 'phone-input';
  readonly options = noOptions;

  schema() {
    return z.string().regex(/^[+]?[\d\s().-]{5,30}$/, 'Enter a phone number, such as 512 555 0142.');
  }

  override get takesSubmissions() {
    return true;
  }
}

/**
 * A colour as a swatch may say it: a hex colour, or one of CSS's colour functions holding only
 * numbers. It is drawn as a sample beside a choice, so it must be a colour and nothing else.
 */
const SWATCH_COLOUR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:oklch|oklab|rgb|hsl)\([0-9.%,/ -]+\))$/i;

/** Whether a value is a colour a swatch can show. */
export function isSwatchColour(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && SWATCH_COLOUR.test(value);
}

/** One choice from a fixed list. */
export class SelectField extends FieldType<string, { choices: string[]; labels?: Record<string, Record<string, string>> | undefined; swatches?: Record<string, string> | undefined }> {
  readonly type = 'select';
  readonly editor = 'select';
  readonly options = z.object({
    /** The values that are stored. */
    choices: z.array(z.string()).min(1),
    /** What the editor calls each choice, per language: `{ 'coming-soon': { en: 'Coming soon' } }`. */
    labels: z.record(z.string(), z.record(z.string(), z.string())).optional(),
    /**
     * A sample colour for each choice, where the choices are looks of the template's own (a
     * section's background): `{ secondary: '#f4f1ec' }`. The editor then shows the choices as
     * swatches. The value stored is still the choice's name, never the colour.
     */
    swatches: z.record(z.string(), z.string().refine(isSwatchColour, 'A swatch is a hex colour or a CSS colour function, such as #f4f1ec or oklch(96% 0.01 80).')).optional(),
  });

  schema({ choices }: { choices: string[] }) {
    return z.enum(choices as [string, ...string[]]);
  }

  override get takesSubmissions() {
    return true;
  }
}

/** A hex colour: `#rgb` or `#rrggbb`, what a colour picker hands back. */
const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Whether a value is a colour a `color` field holds. */
export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOUR.test(value);
}

/**
 * A colour of the site's theme that a person sets, such as the brand colour: a hex colour and
 * nothing else, so a template can put it in a style without it ever being an address or more CSS.
 * The template decides where it is used, and what goes with it (the text on it, its shades).
 */
export class ColorField extends FieldType<string, { presets?: string[] | undefined }> {
  readonly type = 'color';
  readonly editor = 'color-picker';
  readonly options = z.object({
    /** Colours to suggest, a press away, as hex colours: the template's own palette. At most 12. */
    presets: z.array(z.string().refine(isHexColour, 'A suggested colour is a hex colour, such as #1f3a5f.')).max(12).optional(),
  });

  schema() {
    return z.string().refine(isHexColour, 'Type a hex colour, such as #1f3a5f.');
  }
}

/**
 * One of the fonts a template offers for a part of the site, such as its headings. What is
 * stored is the font's name among `choices`; the template loads the font and decides where it
 * goes, so only fonts it has can be chosen.
 */
export class FontField extends FieldType<string, { choices: string[]; labels?: Record<string, Record<string, string>> | undefined }> {
  readonly type = 'font';
  readonly editor = 'font-picker';
  readonly options = z.object({
    /** The fonts that can be chosen, by the names the template knows them by: `['inter', 'fraunces']`. */
    choices: z.array(z.string()).min(1),
    /** What the editor calls each font, per language: `{ fraunces: { en: 'Fraunces' } }`. */
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
 * One of the site's forms, such as the contact form a section of a page shows.
 *
 * It stores the form's id, never its key, so the form can be renamed. The page asks for the form
 * as it is today when it is drawn, and leaves the section out when the form is closed or gone.
 */
export class FormField extends FieldType<string, NoOptions> {
  readonly type = 'form';
  readonly editor = 'form-picker';
  readonly options = noOptions;

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

/** The settings of a rich text field. */
export interface RichTextOptions {
  /** What the field may hold beyond paragraphs. Left out, everything the format has. */
  readonly formats?: readonly RichTextFormat[] | undefined;
}

/**
 * Text with headings, lists, bold, italics and links. Stored as a tree, never as HTML, and given
 * to the site as HTML made from that tree. A field that was plain text, or a list of
 * paragraphs, can be changed to this type: what is stored is read as paragraphs.
 *
 * A field shown in a tight spot of a design names the formats that spot was drawn for
 * (`formats`): the editor offers only those, and anything else that reaches a save (pasted, or
 * sent by a script) is turned into plain paragraphs, never refused, so no words are lost. What is
 * handed to the site is limited the same way, for text saved before the field was.
 */
export class RichTextField extends FieldType<RichText, RichTextOptions> {
  readonly type = 'richtext';
  readonly editor = 'rich-text';
  readonly options = z.object({ formats: z.array(z.enum(RICH_TEXT_FORMATS)).optional() });

  schema({ formats }: RichTextOptions) {
    return formats === undefined ? richTextSchema : richTextSchema.transform((text) => limitRichText(text, formats));
  }

  override define(described: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    // Each format once, in the order the editor shows them.
    const formats = described['formats'];
    if (!Array.isArray(formats)) return described;
    return { ...described, formats: RICH_TEXT_FORMATS.filter((format) => formats.includes(format)) };
  }

  override toPublic(value: RichText | string | readonly string[], { formats }: RichTextOptions): PublicRichText {
    // What was saved before the field became rich text is still plain.
    const stored = typeof value === 'string' || Array.isArray(value) ? fromPlainText(value as string | readonly string[]) : (value as RichText);
    const text = limitRichText(stored, formats);
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
    .register(new EmailField())
    .register(new PhoneField())
    .register(new SelectField())
    .register(new ColorField())
    .register(new FontField())
    .register(new ReferenceField())
    .register(new ImageField())
    .register(new RichTextField())
    .register(new GroupField())
    .register(new ListField())
    .register(new BlocksField())
    .register(new LinkField())
    .register(new FormField());
}
