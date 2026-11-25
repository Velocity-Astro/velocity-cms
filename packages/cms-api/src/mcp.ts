import {
  CmsError,
  ValidationError,
  fromStoredData,
  hasUnpublishedChanges,
  liveFields,
  pageAddress,
  richTextFromMarkdown,
  richTextSchema,
  richTextToMarkdown,
  toStoredData,
  type Actor,
  type BlockDef,
  type Cms,
  type ContactChanges,
  type ContentTypeDef,
  type CustomFieldsChanges,
  type DealChanges,
  type Entry,
  type FieldDef,
  type LocalizedText,
  type NewContact,
  type NewDeal,
  type NewForm,
  type Permission,
  type PipelineChanges,
} from '@velocity-astro/cms-core';
import { z } from 'zod';

/**
 * The Model Context Protocol, spoken over the API (`POST /api/cms/mcp`), so an AI agent such as
 * Claude, ChatGPT or Cursor can work with a site's content: read the content types, write and
 * publish entries, build pages from the template's sections, and, where its token allows, work
 * with forms, contacts and deals.
 *
 * It holds no rules of its own, like every route of the API. Each tool checks the shape of what
 * it was sent and calls the services as the actor that asked, so a token's role and allowances
 * decide what an agent may do, exactly as a person's role does. Values go in and come out by
 * field key; the services keep them by field id. Pages are built only from the blocks the
 * template describes, with their own fields: the agent works on the rails the editor does.
 *
 * The transport is the protocol's "streamable HTTP" in its plain form: one JSON-RPC message (or
 * a list of them) in, the answer as JSON out. Nothing is streamed and no session is kept.
 */

/** The versions of the protocol this server speaks, newest first. */
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;
const SERVER = { name: 'velocity-cms', title: 'Velocity CMS', version: '1' };

const INSTRUCTIONS = `This is a site's content in Velocity CMS.
Start with describe_site: it lists the content types, what this token may do, and the forms.
Values are written by field key. Formatted text (richtext) is read as {"markdown": "..."} and takes the same back, or a plain string: headings, lists, quotes, bold, italics, code in backticks and links.
A page built from sections (a "blocks" field) is built from the blocks its content type lists, each with its own fields: read get_content_type or list_blocks first, then add_section, update_section, move_section, remove_section or set_sections. A look is one of the choices a field offers.
An idea the blocks cannot show is welcome: a new kind of section is a block in the site's model with a component of the same key in its code, so it is drawn on the theme and editors can change it. design_new_section gives the site's colours, fonts and blocks to design from and the steps to add one; once it is deployed, these tools use it like any other.
What you write is a draft until it is published. Publishing needs a token that allows it; otherwise tell the person the draft is ready for them to publish in the editor.
Contacts, deals and what visitors sent are personal data: they are there only when the token allows it, and never belong on a page.`;

export interface McpEndpointOptions {
  readonly cms: Cms;
  /** The language an entry is written in when a tool names none. */
  readonly defaultLocale: string;
}

/** One tool: what it is called, what it says it does, what it takes and what it does. */
export interface McpTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: z.ZodObject;
  /** True for a tool that changes nothing. */
  readonly readOnly?: boolean;
  readonly run: (input: never, call: ToolCall) => Promise<unknown>;
}

interface ToolCall {
  readonly cms: Cms;
  readonly actor: Actor;
  readonly locale: string;
}

interface RpcMessage {
  readonly jsonrpc?: unknown;
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const say = (text: LocalizedText | undefined, locale: string): string | undefined => text?.[locale] ?? Object.values(text ?? {})[0];

/** Text as a tool takes it: one string (in the default language) or text per language. */
const words = z.union([z.string(), z.record(z.string(), z.string())]);
const wordsIn = (value: string | Record<string, string>, locale: string): LocalizedText => (typeof value === 'string' ? { [locale]: value } : value);
const values = z.record(z.string(), z.unknown());
const limit = z.number().int().min(1).max(200).default(50);
const offset = z.number().int().min(0).default(0);
const entryId = z.string().min(1).describe('The entry\'s id, from list_entries or get_entry.');

/**
 * Values as an agent writes them, made ready for the services: `{ "markdown": "..." }`, anywhere,
 * becomes formatted text. Nothing else is changed; each field's type checks the rest.
 */
function written(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(written);
  if (!isObject(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === 'markdown' && typeof value['markdown'] === 'string') return richTextFromMarkdown(value['markdown']);
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, written(inner)]));
}

/**
 * Values as an agent reads them: formatted text, anywhere, is `{ "markdown": "..." }`, which is
 * what it would write. So what a tool hands over can be changed and sent straight back.
 */
function read(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(read);
  if (!isObject(value)) return value;
  if (value['type'] === 'doc' && Array.isArray(value['content'])) {
    const text = richTextSchema.safeParse(value);
    if (text.success) return { markdown: richTextToMarkdown(text.data) };
  }
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, read(inner)]));
}

const isFieldDef = (value: unknown): value is FieldDef => isObject(value) && typeof value['id'] === 'string' && typeof value['key'] === 'string' && typeof value['type'] === 'string' && isObject(value['label']);
const isBlockDef = (value: unknown): value is BlockDef => isObject(value) && typeof value['id'] === 'string' && typeof value['key'] === 'string' && Array.isArray(value['fields']) && value['type'] === undefined;

/** Fields as an agent needs them: by key, with what each takes and the fields and blocks inside it. Ids are left out. */
function describeFields(fields: readonly FieldDef[], locale: string): unknown[] {
  return liveFields(fields).map((field) => {
    const options = describeOptions(field.options, locale);
    return {
      key: field.key,
      type: field.type,
      label: say(field.label, locale),
      ...(field.required && { required: true }),
      ...(!field.translated && { sharedAcrossLanguages: true }),
      ...(field.help && { help: say(field.help, locale) }),
      ...(isObject(options) && Object.keys(options).length > 0 && { options }),
    };
  });
}

/** A field's settings, with the fields and blocks inside them described in turn, whatever the field's type. */
function describeOptions(value: unknown, locale: string): unknown {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isFieldDef)) return describeFields(value, locale);
    if (value.length > 0 && value.every(isBlockDef)) return describeBlocks(value, locale);
    return value.map((item) => describeOptions(item, locale));
  }
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, describeOptions(inner, locale)]));
}

/** A field's settings as `options`, when it has any worth saying. */
function describeOptionsOf(field: FieldDef, locale: string): { options?: unknown } {
  const options = describeOptions(field.options, locale);
  return isObject(options) && Object.keys(options).length > 0 ? { options } : {};
}

/** The blocks a field allows, as a page may be built from them today. A retired block is left out. */
function describeBlocks(blocks: readonly BlockDef[], locale: string): unknown[] {
  return blocks
    .filter((block) => block.retiredAt === undefined)
    .map((block) => ({
      key: block.key,
      label: say(block.label, locale),
      ...(block.description && { description: say(block.description, locale) }),
      ...(block.group && { group: block.group }),
      fields: describeFields(block.fields, locale),
    }));
}

/** The name an entry is called by: its type's title field, or the first text field. */
function titleOf(type: ContentTypeDef, entry: Entry): string | undefined {
  const path = type.titlePath ?? [liveFields(type.fields).find((field) => field.type === 'text')?.id ?? ''];
  let value: unknown = entry.data;
  for (const id of path) value = isObject(value) ? value[id] : undefined;
  return typeof value === 'string' ? value : undefined;
}

function summary(type: ContentTypeDef, entry: Entry) {
  return {
    id: entry.id,
    title: titleOf(type, entry) ?? entry.slug,
    slug: entry.slug,
    locale: entry.locale,
    status: entry.status,
    ...(hasUnpublishedChanges(entry) && { unpublishedChanges: true }),
    ...(entry.publishAt && { publishAt: entry.publishAt }),
    updatedAt: entry.updatedAt,
  };
}

/** The `blocks` field a section tool works in: the one named, or the type's only one. */
function sectionsField(type: ContentTypeDef, key: string | undefined): FieldDef {
  const fields = liveFields(type.fields).filter((field) => field.type === 'blocks');
  const field = key === undefined ? (fields.length === 1 ? fields[0] : undefined) : fields.find((candidate) => candidate.key === key);
  if (field) return field;
  const known = fields.map((candidate) => candidate.key).join(', ');
  throw new ValidationError(
    fields.length === 0
      ? `The ${type.key} content type has no sections: it is not built from blocks.`
      : key === undefined
        ? `The ${type.key} content type has more than one field of sections. Name one as "field": ${known}.`
        : `The ${type.key} content type has no field of sections called "${key}". Its fields of sections are: ${known}.`,
    [{ path: ['field'], message: 'No such field of sections.' }],
  );
}

interface Section {
  readonly id?: unknown;
  readonly block: string;
  readonly data: Record<string, unknown>;
  readonly hidden?: true;
}

const sectionList = (value: unknown): Section[] =>
  (Array.isArray(value) ? value : []).filter(isObject).map((section) => ({ ...section, block: String(section['block']), data: isObject(section['data']) ? section['data'] : {} }) as Section);

async function loadEntry(call: ToolCall, id: string) {
  const entry = await call.cms.content.get(call.actor, id);
  const type = await call.cms.schema.get(entry.typeId);
  return { entry, type, values: fromStoredData(type.fields, entry.data) };
}

/** The entry as an agent reads it: its values by key, where its page is, and what to send back to change it. */
function entryView(type: ContentTypeDef, entry: Entry, locale: string) {
  const page = entry.published ? pageAddress(type, { locale: entry.locale, ...entry.published }, locale) : null;
  return {
    ...summary(type, entry),
    type: type.key,
    translationGroup: entry.translationGroup,
    revision: entry.revision,
    ...(entry.published && { publishedSlug: entry.published.slug, publishedAt: entry.published.at }),
    ...(page !== null && { page }),
    ...(entry.publishProblem && { publishProblem: entry.publishProblem }),
    data: read(fromStoredData(type.fields, entry.data)) as Record<string, unknown>,
  };
}

/** Saves new values for an entry, with the revision it was read at, and publishes it when asked. */
async function save(call: ToolCall, entry: Entry, type: ContentTypeDef, next: Record<string, unknown>, options: { readonly slug?: string | undefined; readonly publish?: boolean | undefined } = {}) {
  const data = toStoredData(type.fields, next, () => globalThis.crypto.randomUUID());
  let saved = await call.cms.content.update(call.actor, entry.id, { data, expectedRevision: entry.revision, ...(options.slug !== undefined && { slug: options.slug }) });
  if (options.publish) saved = await call.cms.content.publish(call.actor, saved.id, saved.revision);
  return entryView(type, saved, call.locale);
}

/** Changes the sections of one field of an entry, through the same save as every change. */
async function changeSections(call: ToolCall, input: { readonly id: string; readonly field?: string | undefined; readonly publish?: boolean | undefined }, change: (sections: Section[], blocks: readonly BlockDef[]) => Section[]) {
  const { entry, type, values: current } = await loadEntry(call, input.id);
  const field = sectionsField(type, input.field);
  const blocks = ((field.options as { blocks?: BlockDef[] }).blocks ?? []).filter((block) => block.retiredAt === undefined);
  const sections = change(sectionList(current[field.key]), blocks);
  const view = await save(call, entry, type, { ...current, [field.key]: sections }, { publish: input.publish });
  return { ...view, data: undefined, sections: outline(view.data[field.key]) };
}

/** The sections of a page in order, short enough to read: which block, its id and its values. */
function outline(value: unknown) {
  return sectionList(value).map((section, index) => ({ index, id: section.id, block: section.block, ...(section.hidden && { hidden: true }), data: section.data }));
}

/** A block the field allows, or a refusal that lists the ones it does. */
function blockOf(blocks: readonly BlockDef[], key: string): BlockDef {
  const block = blocks.find((candidate) => candidate.key === key);
  if (block) return block;
  throw new ValidationError(`There is no block "${key}" here yet. The blocks this page can be built from are: ${blocks.map((candidate) => candidate.key).join(', ')}. To add a new kind of section, see design_new_section.`, [{ path: ['block'], message: 'No such block.' }]);
}

function indexOf(sections: readonly Section[], id: string): number {
  const index = sections.findIndex((section) => section.id === id);
  if (index < 0) throw new ValidationError(`There is no section "${id}" on this page. get_sections lists them.`, [{ path: ['section'], message: 'No such section.' }]);
  return index;
}

/** Leaves out what was not given, which a service reads as "not changed". */
function given<T>(input: object): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}

const tool = <S extends z.ZodObject>(definition: { name: string; title: string; description: string; input: S; readOnly?: boolean; run: (input: z.infer<S>, call: ToolCall) => Promise<unknown> }): McpTool => definition as unknown as McpTool;

const ALL_PERMISSIONS: readonly Permission[] = ['schema:write', 'entry:read', 'entry:write', 'entry:publish', 'entry:delete', 'form:write', 'submission:read', 'submission:manage', 'contact:read', 'contact:manage', 'user:manage', 'plugin:manage', 'settings:manage'];

const formField = z.object({
  id: z.string().optional().describe('Keep the id a field was read with, so what it holds stays with it.'),
  key: z.string(),
  type: z.string().describe('A kind a visitor can fill in: text, email, phone, number, date, select, boolean, url.'),
  label: words,
  help: words.optional(),
  required: z.boolean().optional(),
  options: values.optional(),
});
const fieldsIn = (fields: readonly z.infer<typeof formField>[], locale: string) =>
  fields.map((field) => given<Record<string, unknown>>({ ...field, label: wordsIn(field.label, locale), help: field.help === undefined ? undefined : wordsIn(field.help, locale) }));

/** Every tool, in the order a client lists them. */
export const MCP_TOOLS: readonly McpTool[] = [
  tool({
    name: 'describe_site',
    title: 'Describe the site',
    description: 'Start here. The content types (with their address patterns and field keys), the forms, and what this token may do.',
    input: z.object({}),
    readOnly: true,
    run: async (_input, { cms, actor, locale }) => {
      const types = await cms.schema.list();
      const can = ALL_PERMISSIONS.filter((permission) => cms.access.can(actor, permission));
      const forms = can.includes('entry:read') ? await cms.forms.list(actor) : [];
      return {
        defaultLanguage: locale,
        mayDo: can,
        contentTypes: types.map((type) => ({
          key: type.key,
          kind: type.kind,
          label: say(type.label, locale),
          ...(type.urlPattern && { urlPattern: type.urlPattern }),
          ...(type.inSettings && { inSettings: true }),
          ...(type.sitePart && { sitePart: true }),
          fields: liveFields(type.fields).map((field) => `${field.key} (${field.type})`),
          ...(liveFields(type.fields).some((field) => field.type === 'blocks') && { builtFromSections: true }),
        })),
        forms: forms.map((form) => ({ key: form.key, label: say(form.label, locale), open: form.open })),
      };
    },
  }),
  tool({
    name: 'get_content_type',
    title: 'Get a content type',
    description: 'One content type in full: every field by key with its type, whether it is required, its choices and, for a page built from sections, every block it allows with that block\'s fields.',
    input: z.object({ type: z.string().describe('The content type\'s key, such as pages or posts.') }),
    readOnly: true,
    run: async ({ type: key }, { cms, locale }) => {
      const type = await cms.schema.getByKey(key);
      return { key: type.key, kind: type.kind, label: say(type.label, locale), ...(type.urlPattern && { urlPattern: type.urlPattern }), ...(type.localizedUrlPatterns && { localizedUrlPatterns: type.localizedUrlPatterns }), fields: describeFields(type.fields, locale) };
    },
  }),
  tool({
    name: 'list_blocks',
    title: 'List the blocks a page takes',
    description: 'The blocks (kinds of section) a content type\'s pages can be built from today, each with its fields. For an idea none of them can show, see design_new_section.',
    input: z.object({ type: z.string(), field: z.string().optional().describe('The field of sections, when the type has more than one.') }),
    readOnly: true,
    run: async ({ type: key, field }, { cms, locale }) => {
      const type = await cms.schema.getByKey(key);
      const sections = sectionsField(type, field);
      return { type: type.key, field: sections.key, blocks: describeBlocks((sections.options as { blocks?: BlockDef[] }).blocks ?? [], locale) };
    },
  }),
  tool({
    name: 'design_new_section',
    title: 'Design a new kind of section',
    description: 'For an idea no block can show: the site\'s theme (its published colours and fonts), every block it has with its fields and named looks, and the steps to add a new block and its component in the site\'s code.',
    input: z.object({}),
    readOnly: true,
    run: async (_input, { cms, actor, locale }) => {
      const types = await cms.schema.list();
      const theme: Record<string, unknown>[] = [];
      for (const type of types.filter((one) => one.kind === 'single')) {
        const looks = liveFields(type.fields).filter((field) => field.type === 'color' || field.type === 'font');
        if (looks.length === 0) continue;
        const [entry] = (await cms.content.find(actor, { typeId: type.id, limit: 1 })).items;
        const published = entry?.published ? fromStoredData(type.fields, entry.published.data) : {};
        theme.push({ type: type.key, fields: looks.map((field) => ({ key: field.key, type: field.type, label: say(field.label, locale), value: published[field.key] ?? null, ...describeOptionsOf(field, locale) })) });
      }
      const blocks = types.flatMap((type) =>
        liveFields(type.fields)
          .filter((field) => Array.isArray((field.options as { blocks?: unknown }).blocks))
          .map((field) => ({ type: type.key, field: field.key, blocks: describeBlocks((field.options as { blocks: BlockDef[] }).blocks, locale) })),
      );
      return {
        theme,
        blocks,
        steps: [
          'In the site\'s code, describe the block in the model (usually cms/model.mjs) on the blocks field of the types that should take it: { key, label, description, icon, group, fields }. Keys start with a lowercase letter and are permanent.',
          'Give each look a select field with named choices (and swatches for colours) drawn from the theme above, never a free colour, size or class. Text, pictures, links, lists and forms are fields of their own, so editors can change them.',
          'Write its component, of the same key, in the block map (export const blocks = { ... }): every prop optional, wrapped with sectionMark(section.id, section.data), each field marked with fieldMark(key).',
          'Run the seed, then `npx velocity-cms check`, and build the site. The cms-add-section skill has each step in full.',
          'Once the site is deployed, add_section can place it on any page whose type takes it.',
        ],
      };
    },
  }),
  tool({
    name: 'list_entries',
    title: 'List entries',
    description: 'The entries of one content type, most recently changed first: id, title, slug, language and status. Give a slug to find one entry.',
    input: z.object({ type: z.string(), locale: z.string().optional(), slug: z.string().optional(), status: z.enum(['draft', 'scheduled', 'published']).optional(), limit, offset }),
    readOnly: true,
    run: async ({ type: key, ...query }, { cms, actor }) => {
      const type = await cms.schema.getByKey(key);
      const page = await cms.content.find(actor, given({ typeId: type.id, order: 'updated', ...query }));
      return { total: page.total, items: page.items.map((entry) => summary(type, entry)) };
    },
  }),
  tool({
    name: 'get_entry',
    title: 'Get an entry',
    description: 'One entry: its values by field key (the version being worked on), its status, revision and the address of its page.',
    input: z.object({ id: entryId }),
    readOnly: true,
    run: async ({ id }, call) => {
      const { entry, type } = await loadEntry(call, id);
      return entryView(type, entry, call.locale);
    },
  }),
  tool({
    name: 'create_entry',
    title: 'Create an entry',
    description:
      'Creates an entry as a draft, with its values by field key. A page built from sections takes a list of {"block": "<key>", "data": {...}} in its sections field. Give translationOf (an entry id) to write the same entry in another language. Set publish to put it on the site, if this token may.',
    input: z.object({
      type: z.string(),
      slug: z.string().describe('The entry\'s name in its address: lowercase words joined by hyphens. A page whose address pattern is /[...slug] may use parts, such as services/roofing; index is the home page.'),
      data: values,
      locale: z.string().optional(),
      translationOf: z.string().optional(),
      publish: z.boolean().optional(),
    }),
    run: async ({ type: key, slug, data, locale, translationOf, publish }, call) => {
      const { cms, actor } = call;
      const type = await cms.schema.getByKey(key);
      const group = translationOf === undefined ? undefined : (await cms.content.get(actor, translationOf)).translationGroup;
      const stored = toStoredData(type.fields, written(data) as Record<string, unknown>, () => globalThis.crypto.randomUUID());
      let entry = await cms.content.create(actor, { typeId: type.id, locale: locale ?? call.locale, slug, data: stored, ...(group !== undefined && { translationGroup: group }) });
      if (publish) entry = await cms.content.publish(actor, entry.id, entry.revision);
      return entryView(type, entry, call.locale);
    },
  }),
  tool({
    name: 'update_entry',
    title: 'Update an entry',
    description: 'Changes an entry\'s values by field key. Each key given replaces that field\'s value (null empties it); fields not named stay as they are. Saved as a draft unless publish is set.',
    input: z.object({ id: entryId, data: values.default({}), slug: z.string().optional(), publish: z.boolean().optional() }),
    run: async ({ id, data, slug, publish }, call) => {
      const { entry, type, values: current } = await loadEntry(call, id);
      return save(call, entry, type, { ...current, ...(written(data) as Record<string, unknown>) }, { slug, publish });
    },
  }),
  tool({
    name: 'publish_entry',
    title: 'Publish an entry',
    description: 'Puts the version being worked on on the site, at once. Needs a token that may publish.',
    input: z.object({ id: entryId }),
    run: async ({ id }, call) => {
      const { entry, type } = await loadEntry(call, id);
      return entryView(type, await call.cms.content.publish(call.actor, id, entry.revision), call.locale);
    },
  }),
  tool({
    name: 'unpublish_entry',
    title: 'Unpublish an entry',
    description: 'Takes an entry off the site. Its content is kept as a draft.',
    input: z.object({ id: entryId }),
    run: async ({ id }, call) => {
      const { type } = await loadEntry(call, id);
      return entryView(type, await call.cms.content.unpublish(call.actor, id), call.locale);
    },
  }),
  tool({
    name: 'schedule_entry',
    title: 'Schedule an entry',
    description: 'Sets a time for the entry to go on the site by itself, as it is then.',
    input: z.object({ id: entryId, at: z.string().describe('When, as an ISO 8601 time with its zone, such as 2026-12-01T09:00:00Z.') }),
    run: async ({ id, at }, call) => {
      const { entry, type } = await loadEntry(call, id);
      return entryView(type, await call.cms.content.schedule(call.actor, id, { at, expectedRevision: entry.revision }), call.locale);
    },
  }),
  tool({
    name: 'duplicate_entry',
    title: 'Duplicate an entry',
    description: 'Makes a draft copy of an entry, with a free slug.',
    input: z.object({ id: entryId }),
    run: async ({ id }, call) => {
      const { type } = await loadEntry(call, id);
      return entryView(type, await call.cms.content.duplicate(call.actor, id), call.locale);
    },
  }),
  tool({
    name: 'trash_entry',
    title: 'Move an entry to the trash',
    description: 'Takes an entry off the site and out of every list. It can be restored from the trash in the editor.',
    input: z.object({ id: entryId }),
    run: async ({ id }, call) => {
      const { type } = await loadEntry(call, id);
      const entry = await call.cms.content.trash(call.actor, id);
      return { ...summary(type, entry), trashed: true };
    },
  }),
  tool({
    name: 'entry_history',
    title: 'List an entry\'s history',
    description: 'Every saved version of an entry, newest first: revision, status and when.',
    input: z.object({ id: entryId }),
    readOnly: true,
    run: async ({ id }, { cms, actor }) => (await cms.content.history(actor, id)).map(({ revision, status, createdAt, actorId }) => ({ revision, status, createdAt, by: actorId })),
  }),
  tool({
    name: 'preview_link',
    title: 'Make a preview link',
    description: 'A link to the entry\'s page showing the saved draft, good for a while, to show a person before it is published.',
    input: z.object({ id: entryId }),
    run: async ({ id }, { cms, actor }) => cms.previews.link(actor, id),
  }),
  tool({
    name: 'get_sections',
    title: 'Get a page\'s sections',
    description: 'The sections of a page in order: index, id, block and values. Section ids are what the other section tools take.',
    input: z.object({ id: entryId, field: z.string().optional() }),
    readOnly: true,
    run: async ({ id, field }, call) => {
      const { type, values: current } = await loadEntry(call, id);
      const sections = sectionsField(type, field);
      return { field: sections.key, sections: outline(current[sections.key]) };
    },
  }),
  tool({
    name: 'add_section',
    title: 'Add a section',
    description: 'Adds a section to a page, from one of the blocks the page allows (list_blocks), with that block\'s values by field key. At the end unless an index or the id of a section to follow is given.',
    input: z.object({ id: entryId, block: z.string(), data: values.default({}), field: z.string().optional(), index: z.number().int().min(0).optional(), after: z.string().optional(), publish: z.boolean().optional() }),
    run: async ({ block, data, index, after, ...input }, call) =>
      changeSections(call, input, (sections, blocks) => {
        const section: Section = { block: blockOf(blocks, block).key, data: written(data) as Record<string, unknown> };
        const at = after !== undefined ? indexOf(sections, after) + 1 : Math.min(index ?? sections.length, sections.length);
        return [...sections.slice(0, at), section, ...sections.slice(at)];
      }),
  }),
  tool({
    name: 'update_section',
    title: 'Update a section',
    description: 'Changes the values of one section, by field key. Keys not named stay as they are; null empties one. Its block cannot change: remove it and add another.',
    input: z.object({ id: entryId, section: z.string(), data: values, field: z.string().optional(), publish: z.boolean().optional() }),
    run: async ({ section: sectionId, data, ...input }, call) =>
      changeSections(call, input, (sections) => {
        const at = indexOf(sections, sectionId);
        const section = sections[at] as Section;
        return sections.map((one, index) => (index === at ? { ...section, data: { ...section.data, ...(written(data) as Record<string, unknown>) } } : one));
      }),
  }),
  tool({
    name: 'move_section',
    title: 'Move a section',
    description: 'Moves one section to a new place in the page, counted from 0.',
    input: z.object({ id: entryId, section: z.string(), to: z.number().int().min(0), field: z.string().optional(), publish: z.boolean().optional() }),
    run: async ({ section: sectionId, to, ...input }, call) =>
      changeSections(call, input, (sections) => {
        const at = indexOf(sections, sectionId);
        const rest = sections.filter((_, index) => index !== at);
        const place = Math.min(to, rest.length);
        return [...rest.slice(0, place), sections[at] as Section, ...rest.slice(place)];
      }),
  }),
  tool({
    name: 'remove_section',
    title: 'Remove a section',
    description: 'Takes one section off a page. The entry\'s history keeps it.',
    input: z.object({ id: entryId, section: z.string(), field: z.string().optional(), publish: z.boolean().optional() }),
    run: async ({ section: sectionId, ...input }, call) =>
      changeSections(call, input, (sections) => {
        const at = indexOf(sections, sectionId);
        return sections.filter((_, index) => index !== at);
      }),
  }),
  tool({
    name: 'set_sections',
    title: 'Lay out a page',
    description: 'Replaces every section of a page at once, in order: a list of {"block": "<key>", "data": {...}}. Keep a section\'s "id" to keep it as it is; leave it out for a new one.',
    input: z.object({ id: entryId, sections: z.array(z.object({ id: z.string().optional(), block: z.string(), data: values.default({}) })), field: z.string().optional(), publish: z.boolean().optional() }),
    run: async ({ sections: wanted, ...input }, call) =>
      changeSections(call, input, (_sections, blocks) => wanted.map((section) => given<Section>({ id: section.id, block: blockOf(blocks, section.block).key, data: written(section.data) as Record<string, unknown> }))),
  }),
  tool({
    name: 'list_images',
    title: 'List images',
    description: 'The images an image field can hold: the template\'s own and those uploaded. An image field stores the name.',
    input: z.object({}),
    readOnly: true,
    run: async (_input, { cms, actor }) => (await cms.media.images(actor)).map(({ name, url, width, height }) => given({ name, url, width, height })),
  }),
  tool({
    name: 'list_forms',
    title: 'List forms',
    description: 'The site\'s forms with their fields. A section that shows a form stores the form\'s id.',
    input: z.object({}),
    readOnly: true,
    run: async (_input, { cms, actor, locale }) =>
      (await cms.forms.list(actor)).map((form) => ({ id: form.id, key: form.key, label: say(form.label, locale), open: form.open, ...(form.startsDeal && { startsDeal: true }), fields: describeFields(form.fields, locale) })),
  }),
  tool({
    name: 'create_form',
    title: 'Create a form',
    description: 'Makes a form visitors fill in. contact names the keys of the fields that hold the sender\'s name, email and phone, which is what makes a sender a contact in the CRM.',
    input: z.object({
      key: z.string(),
      label: words,
      fields: z.array(formField).max(50),
      submitLabel: words.optional(),
      success: words.optional(),
      notify: z.array(z.string()).optional().describe('Email addresses told of each submission.'),
      contact: z.object({ name: z.string().optional(), email: z.string().optional(), phone: z.string().optional() }).optional(),
      startsDeal: z.boolean().optional(),
    }),
    run: async ({ label, fields, submitLabel, success, ...rest }, { cms, actor, locale }) => {
      const form: NewForm = given({
        ...rest,
        label: wordsIn(label, locale),
        fields: fieldsIn(fields.map(({ id: _id, ...field }) => field), locale),
        submitLabel: submitLabel === undefined ? undefined : wordsIn(submitLabel, locale),
        success: success === undefined ? undefined : wordsIn(success, locale),
        contact: rest.contact === undefined ? undefined : given(rest.contact),
      });
      const made = await cms.forms.create(actor, form);
      return { id: made.id, key: made.key, fields: describeFields(made.fields, locale) };
    },
  }),
  tool({
    name: 'list_submissions',
    title: 'List what a form received',
    description: 'What visitors sent with one form, newest first. Personal data: only for a token allowed it, and never to be put on a page.',
    input: z.object({ form: z.string().describe('The form\'s key.'), status: z.enum(['new', 'handled', 'spam']).optional(), limit, offset }),
    readOnly: true,
    run: async ({ form: key, ...query }, { cms, actor }) => {
      const form = (await cms.forms.list(actor)).find((candidate) => candidate.key === key);
      if (!form) throw new ValidationError(`There is no form "${key}".`, [{ path: ['form'], message: 'No such form.' }]);
      return cms.submissions.find(actor, given({ formId: form.id, ...query }));
    },
  }),
  tool({
    name: 'list_contacts',
    title: 'List contacts',
    description: 'The people who wrote to the site or were added, with their stage. Personal data: only for a token allowed it.',
    input: z.object({ search: z.string().max(200).optional(), stage: z.string().optional().describe('A stage id, from get_pipeline.'), limit, offset }),
    readOnly: true,
    run: async (query, { cms, actor }) => cms.contacts.find(actor, given(query)),
  }),
  tool({
    name: 'get_contact',
    title: 'Get a contact',
    description: 'One contact with their timeline: what they sent and what the team noted.',
    input: z.object({ id: z.string() }),
    readOnly: true,
    run: async ({ id }, { cms, actor }) => ({ contact: await cms.contacts.get(actor, id), timeline: await cms.contacts.timeline(actor, id) }),
  }),
  tool({
    name: 'create_contact',
    title: 'Add a contact',
    description: 'Adds a person to the CRM by hand. Someone already here by email is refused.',
    input: z.object({ email: z.string(), name: z.string().optional(), phone: z.string().optional(), data: values.optional().describe('Custom field values, by custom field id.') }),
    run: async (input, { cms, actor }) => cms.contacts.create(actor, given<NewContact>(input)),
  }),
  tool({
    name: 'update_contact',
    title: 'Update a contact',
    description: 'Changes a contact: their stage, who looks after them, the day to follow up, their name or phone.',
    input: z.object({ id: z.string(), stage: z.string().optional(), ownerId: z.string().nullable().optional(), followUpAt: z.string().nullable().optional(), name: z.string().nullable().optional(), phone: z.string().nullable().optional(), data: values.optional() }),
    run: async ({ id, ...changes }, { cms, actor }) => {
      const contact = await cms.contacts.get(actor, id);
      return cms.contacts.update(actor, id, given<ContactChanges>({ ...changes, expectedRevision: contact.revision }));
    },
  }),
  tool({
    name: 'add_contact_note',
    title: 'Note something on a contact',
    description: 'Adds a note to a contact\'s timeline, as the team does.',
    input: z.object({ id: z.string(), text: z.string() }),
    run: async ({ id, text }, { cms, actor }) => cms.contacts.addNote(actor, id, text),
  }),
  tool({
    name: 'get_pipeline',
    title: 'Get the pipeline',
    description: 'The stages contacts and deals move through (ids, names, kinds, chances), the currency, who new contacts go to and the monthly target.',
    input: z.object({}),
    readOnly: true,
    run: async (_input, { cms, actor }) => cms.pipeline.get(actor),
  }),
  tool({
    name: 'save_pipeline',
    title: 'Set up the pipeline',
    description: 'Sets every stage in order (keep a stage\'s id to keep it; a stage left out is removed and its contacts move to the first), the currency, who new contacts are given to and the monthly target.',
    input: z.object({
      stages: z.array(z.object({ id: z.string().optional(), label: z.string().optional(), kind: z.enum(['open', 'won', 'lost']), chance: z.number().optional() })).max(50),
      currency: z.string().max(10).optional(),
      assignTo: z.array(z.string()).optional().describe('Ids of people on the team, from list_team.'),
      monthlyTarget: z.number().nullable().optional(),
    }),
    run: async ({ stages, ...rest }, { cms, actor }) => {
      const current = await cms.pipeline.get(actor);
      return cms.pipeline.save(actor, given<PipelineChanges>({ ...rest, stages: stages.map((stage) => given(stage)), expectedRevision: current.revision }));
    },
  }),
  tool({
    name: 'list_team',
    title: 'List the team',
    description: 'Who a contact or a deal can be given to: ids, names and roles.',
    input: z.object({}),
    readOnly: true,
    run: async (_input, { cms, actor }) => cms.contacts.owners(actor),
  }),
  tool({
    name: 'get_custom_fields',
    title: 'Get custom fields',
    description: 'The fields the site adds to its contacts and its deals.',
    input: z.object({}),
    readOnly: true,
    run: async (_input, { cms, actor }) => cms.customFields.get(actor),
  }),
  tool({
    name: 'save_custom_fields',
    title: 'Set custom fields',
    description: 'Sets the fields of contacts or of deals, as a whole list. Keep a field\'s id to keep what it holds; a field left out is removed, and its values kept. None can be required.',
    input: z.object({ contact: z.array(formField).max(100).optional(), deal: z.array(formField).max(100).optional() }),
    run: async ({ contact, deal }, { cms, actor, locale }) => {
      const current = await cms.customFields.get(actor);
      return cms.customFields.save(actor, given<CustomFieldsChanges>({ contact: contact && fieldsIn(contact, locale), deal: deal && fieldsIn(deal, locale), expectedRevision: current.revision }));
    },
  }),
  tool({
    name: 'list_deals',
    title: 'List deals',
    description: 'Deals, optionally of one contact or in one stage.',
    input: z.object({ contact: z.string().optional(), stage: z.string().optional(), limit, offset }),
    readOnly: true,
    run: async ({ contact, ...query }, { cms, actor }) => cms.deals.find(actor, given({ ...query, contactId: contact })),
  }),
  tool({
    name: 'create_deal',
    title: 'Create a deal',
    description: 'A deal for a contact: a title, a whole amount of the pipeline\'s currency and a stage. about ties it to an entry (its content type\'s id and its translation group) when that type takes deals.',
    input: z.object({
      contactId: z.string(),
      title: z.string(),
      value: z.number(),
      stage: z.string().optional(),
      ownerId: z.string().optional(),
      closeOn: z.string().optional(),
      about: z.object({ typeId: z.string(), entry: z.string() }).optional(),
      data: values.optional(),
    }),
    run: async (input, { cms, actor }) => cms.deals.create(actor, given<NewDeal>(input)),
  }),
  tool({
    name: 'update_deal',
    title: 'Update a deal',
    description: 'Changes a deal: its stage, value, title, owner or close date.',
    input: z.object({ id: z.string(), title: z.string().optional(), value: z.number().optional(), stage: z.string().optional(), ownerId: z.string().nullable().optional(), closeOn: z.string().nullable().optional(), data: values.optional() }),
    run: async ({ id, ...changes }, { cms, actor }) => {
      const deal = await cms.deals.get(actor, id);
      return cms.deals.update(actor, id, given<DealChanges>({ ...changes, expectedRevision: deal.revision }));
    },
  }),
  tool({
    name: 'forecast',
    title: 'Forecast deals',
    description: 'What is open, forecast and won, by stage.',
    input: z.object({}),
    readOnly: true,
    run: async (_input, { cms, actor }) => cms.deals.forecast(actor),
  }),
];

const RPC_ERRORS = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

/** Answers MCP's JSON-RPC messages for one actor. Faults are the API's to report; a refusal is the tool's answer. */
export class McpEndpoint {
  readonly #options: McpEndpointOptions;
  readonly #tools = new Map(MCP_TOOLS.map((one) => [one.name, one]));

  constructor(options: McpEndpointOptions) {
    this.#options = options;
  }

  /** The answer to a message or a list of them, or `null` when nothing needs one (notifications). */
  async handle(actor: Actor, body: unknown, name?: string): Promise<unknown> {
    if (Array.isArray(body)) {
      const answers = (await Promise.all(body.map((message) => this.#one(actor, message, name)))).filter((answer) => answer !== null);
      return answers.length > 0 ? answers : null;
    }
    return this.#one(actor, body, name);
  }

  async #one(actor: Actor, message: unknown, name: string | undefined): Promise<unknown> {
    if (!isObject(message) || typeof message['method'] !== 'string') {
      // A response sent to us (we ask nothing of the client) or something that is no message.
      return isObject(message) && ('result' in message || 'error' in message) ? null : failure(null, RPC_ERRORS.invalidRequest, 'This is not a JSON-RPC request.');
    }
    const { id, method, params } = message as RpcMessage;
    // A notification (no id) is answered with nothing, whatever it says.
    if (id === undefined) return null;
    const answer = (result: unknown) => ({ jsonrpc: '2.0', id, result });
    switch (method) {
      case 'initialize': {
        const asked = isObject(params) ? params['protocolVersion'] : undefined;
        const protocolVersion = PROTOCOL_VERSIONS.find((version) => version === asked) ?? PROTOCOL_VERSIONS[0];
        return answer({ protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
      }
      case 'ping':
        return answer({});
      case 'tools/list':
        return answer({ tools: [...this.#tools.values()].filter((one) => this.#offered(actor, one)).map(listed) });
      case 'tools/call':
        return answer(await this.#call(actor, params, name));
      case 'resources/list':
        return answer({ resources: [] });
      case 'resources/templates/list':
        return answer({ resourceTemplates: [] });
      case 'prompts/list':
        return answer({ prompts: [] });
      default:
        return failure(id, RPC_ERRORS.methodNotFound, `This server has no method "${String(method)}".`);
    }
  }

  /** Every tool is listed, except those about personal data for an actor that may not read it. */
  #offered(actor: Actor, one: McpTool): boolean {
    const personal = PERSONAL_TOOLS.has(one.name);
    return !personal || this.#options.cms.access.can(actor, 'contact:read') || this.#options.cms.access.can(actor, 'submission:read');
  }

  async #call(actor: Actor, params: unknown, asker: string | undefined) {
    const name = isObject(params) ? params['name'] : undefined;
    const one = typeof name === 'string' ? this.#tools.get(name) : undefined;
    if (!one) return refusal(`There is no tool "${String(name)}". tools/list names them.`);
    const parsed = one.input.safeParse(isObject(params) && params['arguments'] !== undefined ? params['arguments'] : {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return refusal(`The arguments are not in the shape ${one.name} takes. ${first && first.path.length > 0 ? `"${first.path.join('.')}": ` : ''}${first?.message ?? ''}`.trim());
    }
    try {
      const result = await one.run(parsed.data as never, { cms: this.#options.cms, actor, locale: this.#options.defaultLocale });
      // A tool about one entry: whoever has that entry open in the editor sees an agent is at work on it.
      const about = one.input.shape['id'] === entryId ? (parsed.data as { id?: unknown }).id : undefined;
      // Never the tool's to fail over: the work is done.
      if (typeof about === 'string') await this.#options.cms.presence.touched(actor, about, asker ?? '').catch(() => undefined);
      return { content: [{ type: 'text', text: JSON.stringify(result ?? {}, null, 2) }] };
    } catch (error) {
      // A refusal keeps the service's own words, which say what to do. A fault is the API's to report.
      if (!(error instanceof CmsError)) throw error;
      const issues = error instanceof ValidationError && error.issues.length > 0 ? `\n${error.issues.map((issue) => `- ${issue.path.join('.') || '(entry)'}: ${issue.message}`).join('\n')}` : '';
      return refusal(`${error.message}${issues}`);
    }
  }
}

const PERSONAL_TOOLS: ReadonlySet<string> = new Set(['list_submissions', 'list_contacts', 'get_contact', 'create_contact', 'update_contact', 'add_contact_note', 'get_pipeline', 'save_pipeline', 'list_team', 'get_custom_fields', 'save_custom_fields', 'list_deals', 'create_deal', 'update_deal', 'forecast']);

function listed(one: McpTool) {
  const { $schema: _schema, ...inputSchema } = z.toJSONSchema(one.input, { io: 'input' }) as Record<string, unknown>;
  return { name: one.name, title: one.title, description: one.description, inputSchema, annotations: { title: one.title, readOnlyHint: one.readOnly === true, destructiveHint: one.name === 'trash_entry' || one.name === 'remove_section' } };
}

function refusal(text: string) {
  return { content: [{ type: 'text', text }], isError: true };
}

function failure(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}
