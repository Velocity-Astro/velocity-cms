import type { AccessControl, Actor } from '../access.js';
import { defineField, defineFields, requireKey, type NewField } from '../define-fields.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import type { EventBus } from '../events.js';
import type { FieldType } from '../field-type.js';
import {
  isLiveType,
  liveFields,
  type ContentTypeDef,
  type ContentTypeKind,
  type FieldDef,
  type FieldSection,
  type ListSummary,
  type LocalizedText,
} from '../model.js';
import type { Clock, IdGenerator, SchemaRepository } from '../ports.js';
import type { Registry } from '../registry.js';

export interface NewContentType {
  readonly key: string;
  readonly kind: ContentTypeKind;
  readonly label: LocalizedText;
  readonly urlPattern?: string;
  /** Where entries live in the other languages, by locale: `{ es: '/es/propiedades/[slug]' }`. */
  readonly localizedUrlPatterns?: Readonly<Record<string, string>>;
  readonly fields?: readonly NewField[];
  /** The field entries are called by in lists, by key: `name`, or `address.street` inside a group. */
  readonly titleField?: string;
  /** The image field whose picture goes before each entry's name in lists, by key: `photos`. */
  readonly listImage?: string;
  /** The fields that get a column each in lists, by key: `['price', 'status']`. */
  readonly listFields?: readonly string[];
  /** How the editor lays the fields out, with fields named by key. */
  readonly sections?: readonly NewSection[];
}

/** What can be changed about a content type itself. Its key stays: code and addresses use it. */
export interface ContentTypeChanges {
  readonly label?: LocalizedText;
  /** Where entries live on the site. `null` says the type has no page of its own. */
  readonly urlPattern?: string | null;
  /** The field entries are called by in lists, as field ids from the top down. `null` goes back to the first text field. */
  readonly titlePath?: readonly string[] | null;
  /** What a list of entries shows beside each name, as paths of field ids. `null` shows the name alone. */
  readonly list?: ListSummary | null;
}

/** Where a field is, when it is not one of the type's own. */
export interface FieldPlace {
  /** The section that shows a new field, by key. Only for a type's own fields. */
  readonly section?: string;
  /** The fields that hold it, from the top down, by id: a group, or a list of groups. */
  readonly within?: readonly string[];
}

/** What can be changed about a field. Its id and its type stay, and so its content does. */
export interface FieldChanges {
  readonly key?: string;
  readonly label?: LocalizedText;
  /** `null` takes the help away. */
  readonly help?: LocalizedText | null;
  readonly required?: boolean;
  readonly translated?: boolean;
  /** Settings for the field's type, all of them: what is left out goes back to its default. */
  readonly options?: Readonly<Record<string, unknown>>;
}

/** Where every live field of a type is shown, by field id. */
export interface FieldArrangement {
  /** Every live field, in order. */
  readonly order: readonly string[];
  /** Which fields each section shows, by the section's key. A section left out keeps none. */
  readonly sections?: Readonly<Record<string, readonly string[]>>;
  /** The fields that hold the ones being ordered, by id. Left out, they are the type's own. */
  readonly within?: readonly string[];
}

export interface NewSection {
  readonly key: string;
  readonly label: LocalizedText;
  readonly fields: readonly string[];
  /** True to show the section beside the content instead of in it. */
  readonly aside?: boolean;
}

/**
 * Owns content types and their fields.
 *
 * Every change to the schema is safe for existing content: a field keeps its id for life, a
 * rename changes only its key, and a removed field is hidden while its data is kept.
 */
export class SchemaService {
  constructor(
    private readonly types: SchemaRepository,
    private readonly fields: Registry<FieldType>,
    private readonly access: AccessControl,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async get(id: string): Promise<ContentTypeDef> {
    const type = await this.types.get(id);
    if (!type) throw new NotFoundError('Content type', id);
    return type;
  }

  async getByKey(key: string): Promise<ContentTypeDef> {
    const type = await this.types.getByKey(key);
    if (!type) throw new NotFoundError('Content type', key);
    return type;
  }

  /** A content type that is in use. An archived one is refused: it must be restored before anything about it changes. */
  async getLive(id: string): Promise<ContentTypeDef> {
    const type = await this.get(id);
    if (!isLiveType(type)) throw new ConflictError(`The content type "${type.key}" was archived. Restore it before changing it or its entries.`);
    return type;
  }

  /** The content types in use. Archived ones are left out: see `listArchived`. */
  async list(): Promise<ContentTypeDef[]> {
    return (await this.types.list()).filter(isLiveType);
  }

  async listArchived(actor: Actor): Promise<ContentTypeDef[]> {
    this.access.require(actor, 'schema:write');
    return (await this.types.list()).filter((type) => !isLiveType(type));
  }

  /**
   * Takes a content type out of use: out of the editor, and its pages off the site. Nothing is
   * deleted. Its fields and entries stay as they were and its key stays taken, so `restore`
   * brings it all back.
   */
  async archive(actor: Actor, typeId: string): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const type = await this.get(typeId);
    if (!isLiveType(type)) return type;
    const archived = await this.save(actor, { ...type, deletedAt: this.clock.now() });
    await this.events.emit('type.archived', { type: archived, actor });
    return archived;
  }

  async restore(actor: Actor, typeId: string): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const { deletedAt, ...type } = await this.get(typeId);
    if (deletedAt === undefined) return type;
    const restored = await this.save(actor, type);
    await this.events.emit('type.restored', { type: restored, actor });
    return restored;
  }

  async create(actor: Actor, input: NewContentType): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    requireKey(input.key, 'content type');
    requireLabel(input.label, 'content type');
    if (input.urlPattern !== undefined) requirePattern(input.urlPattern);
    const taken = await this.types.getByKey(input.key);
    if (taken) {
      throw new ConflictError(
        isLiveType(taken)
          ? `There is already a content type with the key "${input.key}". Choose another key.`
          : `An archived content type has the key "${input.key}". Restore it, or choose another key.`,
      );
    }
    return this.save(actor, this.described({ id: this.ids.next(), key: input.key, kind: input.kind, label: input.label, fields: [] }, input));
  }

  /**
   * Makes a content type match a description, creating it if it is not there. This is how a
   * template's content types reach a site, and how they are brought up to date.
   *
   * It is safe to run again and again. A field that is already there under the same key keeps
   * its id, so its content stays; it takes the described label, type and settings. Fields the
   * description leaves out are kept as they are. Content is not converted when a field's type
   * changes: a value the new type does not accept is reported the next time its entry is saved.
   */
  async define(actor: Actor, input: NewContentType): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const existing = await this.types.getByKey(input.key);
    if (!existing) return this.create(actor, input);
    return this.save(actor, this.described(existing, input));
  }

  /** Changes what a content type is called, where its entries live and what lists show of them. Fields are changed one at a time. */
  async update(actor: Actor, typeId: string, change: ContentTypeChanges): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const { urlPattern, titlePath, list, ...type } = await this.getLive(typeId);
    if (change.label !== undefined) requireLabel(change.label, 'content type');
    if (typeof change.urlPattern === 'string') requirePattern(change.urlPattern);
    for (const path of [change.titlePath, change.list?.imagePath, ...(change.list?.fieldPaths ?? [])]) {
      if (path) this.requirePath(type.fields, path);
    }
    const address = change.urlPattern === undefined ? urlPattern : change.urlPattern;
    const title = change.titlePath === undefined ? titlePath : change.titlePath;
    const summary = change.list === undefined ? list : change.list;
    return this.save(actor, {
      ...type,
      ...(change.label !== undefined && { label: change.label }),
      ...(typeof address === 'string' && { urlPattern: address }),
      ...(title && { titlePath: title }),
      ...(summary && (summary.imagePath !== undefined || (summary.fieldPaths?.length ?? 0) > 0) && { list: summary }),
    });
  }

  /**
   * Adds a field: to the type, at the end of a section when `place.section` names one, or to a
   * field that holds others (a group, a list of groups) when `place.within` leads to it.
   */
  async addField(actor: Actor, typeId: string, input: NewField, place: FieldPlace = {}): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const type = await this.getLive(typeId);
    const { section, within = [] } = place;
    const fields = this.held(type.fields, within);
    this.requireFreeKey(fields, input.key);
    requireLabel(input.label, 'field');
    const field = defineField(input, undefined, this.context);
    if (section !== undefined && (within.length > 0 || !type.sections?.some((candidate) => candidate.key === section))) {
      throw new ValidationError(`This content type has no section "${section}". Choose one of its sections, or none.`, [
        { path: ['section'], message: `Unknown section "${section}"` },
      ]);
    }
    return this.save(actor, {
      ...type,
      fields: this.holding(type.fields, within, [...fields, field]),
      ...(type.sections && {
        sections: type.sections.map((candidate) => (candidate.key === section ? { ...candidate, fieldIds: [...candidate.fieldIds, field.id] } : candidate)),
      }),
    });
  }

  /** Changes a field's key or label. Its id, and so its data, stay as they are. */
  renameField(actor: Actor, typeId: string, fieldId: string, change: { key?: string; label?: LocalizedText }): Promise<ContentTypeDef> {
    return this.changeField(actor, typeId, fieldId, change);
  }

  /**
   * Changes a field: its key, what it is called, whether it must be filled in, and its type's
   * settings. Its id and its type stay, so the content saved under it is still there. Content is
   * not checked against new settings here: a value they no longer accept is reported the next
   * time its entry is saved. `within` leads to a field inside a group.
   */
  async changeField(actor: Actor, typeId: string, fieldId: string, change: FieldChanges, within: readonly string[] = []): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const type = await this.getLive(typeId);
    const fields = this.held(type.fields, within);
    const field = requireField(fields, fieldId);
    if (field.deletedAt !== undefined) throw new ConflictError(`The field "${field.key}" was removed. Restore it before changing it.`);
    if (change.key !== undefined && change.key !== field.key) this.requireFreeKey(fields, change.key);
    if (change.label !== undefined) requireLabel(change.label, 'field');
    const { help, ...kept } = field;
    const described: NewField = {
      key: change.key ?? field.key,
      type: field.type,
      label: change.label ?? field.label,
      translated: change.translated ?? field.translated,
      required: change.required ?? field.required,
      options: change.options ?? field.options,
      ...(change.help === undefined ? help !== undefined && { help } : change.help !== null && { help: change.help }),
    };
    const changed = { ...kept, ...defineField(described, field, this.context) };
    return this.replaceFields(actor, type, within, fields.map((existing) => (existing.id === fieldId ? changed : existing)));
  }

  /**
   * Puts fields in order: a type's own, saying which section shows which, or with `within` the
   * fields a group holds. Every live field must be named once; removed fields keep their place
   * after them.
   */
  async arrangeFields(actor: Actor, typeId: string, arrangement: FieldArrangement): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const type = await this.getLive(typeId);
    const within = arrangement.within ?? [];
    const fields = this.held(type.fields, within);
    const live = new Map(liveFields(fields).map((field) => [field.id, field]));
    const order = [...new Set(arrangement.order)];
    if (order.length !== arrangement.order.length || order.length !== live.size || order.some((id) => !live.has(id))) {
      throw new ValidationError('The order must name every field once. Load the content type again and retry.', [
        { path: ['order'], message: 'Not every field, or a field twice' },
      ]);
    }
    const ordered = [...order.map((id) => live.get(id) as FieldDef), ...fields.filter((field) => field.deletedAt !== undefined)];
    if (within.length > 0) return this.replaceFields(actor, type, within, ordered);
    const unknown = Object.keys(arrangement.sections ?? {}).find((key) => !type.sections?.some((section) => section.key === key));
    if (unknown !== undefined) {
      throw new ValidationError(`This content type has no section "${unknown}".`, [{ path: ['sections', unknown], message: 'Unknown section' }]);
    }
    const sections = type.sections && this.placed(type.sections.map((section) => ({ ...section, fieldIds: arrangement.sections?.[section.key] ?? [] })), live);
    return this.save(actor, { ...type, fields: ordered, ...(sections && { sections }) });
  }

  /**
   * Says which sections the editor shows for a type, in order, and which fields each shows. It
   * replaces the sections there were: one left out is gone, and its fields are shown after the
   * rest. No field is removed by it.
   */
  async setSections(actor: Actor, typeId: string, sections: readonly FieldSection[]): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const { sections: _before, ...type } = await this.getLive(typeId);
    const keys = new Set<string>();
    for (const section of sections) {
      requireKey(section.key, 'section');
      requireLabel(section.label, 'section');
      if (keys.has(section.key)) throw new ConflictError(`Two sections have the key "${section.key}". Give each its own.`);
      keys.add(section.key);
    }
    const live = new Map(liveFields(type.fields).map((field) => [field.id, field]));
    const placed = this.placed(
      sections.map((section) => ({ key: section.key, label: section.label, fieldIds: section.fieldIds, ...(section.aside === true && { aside: true }) })),
      live,
    );
    return this.save(actor, { ...type, ...(placed.length > 0 && { sections: placed }) });
  }

  /** Hides a field from the editor and the site. Its data is kept, so `restoreField` undoes it. */
  async removeField(actor: Actor, typeId: string, fieldId: string, within: readonly string[] = []): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const type = await this.getLive(typeId);
    const fields = this.held(type.fields, within);
    const field = requireField(fields, fieldId);
    if (field.deletedAt !== undefined) return type;
    const removed = { ...field, deletedAt: this.clock.now() };
    return this.replaceFields(actor, type, within, fields.map((existing) => (existing.id === fieldId ? removed : existing)));
  }

  async restoreField(actor: Actor, typeId: string, fieldId: string, within: readonly string[] = []): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const type = await this.getLive(typeId);
    const fields = this.held(type.fields, within);
    const { deletedAt, ...field } = requireField(fields, fieldId);
    if (deletedAt === undefined) return type;
    this.requireFreeKey(fields, field.key);
    return this.replaceFields(actor, type, within, fields.map((existing) => (existing.id === fieldId ? field : existing)));
  }

  private get context() {
    return { fields: this.fields, ids: this.ids, now: this.clock.now() };
  }

  /** A type with a description applied to it: its fields, what entries are called by, and its layout. */
  private described(type: ContentTypeDef, input: NewContentType): ContentTypeDef {
    const { titlePath: _title, list: _list, sections: _sections, urlPattern: _url, localizedUrlPatterns: _urls, ...rest } = type;
    const fields = defineFields(input.fields ?? [], type.fields, this.context);
    const live = liveFields(fields);
    const sections: FieldSection[] = (input.sections ?? []).map((section) => ({
      key: section.key,
      label: section.label,
      fieldIds: section.fields.map((key) => this.requireFieldByKey(live, key, `section "${section.key}"`).id),
      ...(section.aside === true && { aside: true }),
    }));
    return {
      ...rest,
      label: input.label,
      ...(input.urlPattern !== undefined && { urlPattern: input.urlPattern }),
      ...(input.localizedUrlPatterns !== undefined && { localizedUrlPatterns: input.localizedUrlPatterns }),
      fields,
      ...(input.titleField !== undefined && { titlePath: this.pathOf(live, input.titleField, 'the title field') }),
      ...((input.listImage !== undefined || (input.listFields?.length ?? 0) > 0) && {
        list: {
          ...(input.listImage !== undefined && { imagePath: this.pathOf(live, input.listImage, 'the list image') }),
          ...(input.listFields?.length && { fieldPaths: input.listFields.map((keys) => this.pathOf(live, keys, 'the list field')) }),
        },
      }),
      ...(sections.length > 0 && { sections }),
    };
  }

  /** The ids along a dotted key path, such as `address.street`. */
  private pathOf(fields: readonly FieldDef[], keys: string, what: string): string[] {
    const path: string[] = [];
    let within = fields;
    for (const key of keys.split('.')) {
      const field = this.requireFieldByKey(within, key, `${what} "${keys}"`);
      path.push(field.id);
      within = liveFields(this.fields.get(field.type).inner(field.options));
    }
    return path;
  }

  private requireFieldByKey(fields: readonly FieldDef[], key: string, where: string): FieldDef {
    const field = fields.find((candidate) => candidate.key === key);
    if (!field) {
      throw new ValidationError(`There is no field "${key}" for ${where}. Check the key, or add the field.`, [
        { path: ['fields'], message: `Unknown field "${key}"` },
      ]);
    }
    return field;
  }

  /** The fields at a place: the ones given, or those held by the field `within` leads to. */
  private held(fields: readonly FieldDef[], within: readonly string[]): readonly FieldDef[] {
    const [id, ...rest] = within;
    if (id === undefined) return fields;
    const holder = requireField(liveFields(fields), id);
    const type = this.fields.get(holder.type);
    if (type.withInner(holder.options, [], this.fields) === null) {
      throw new ConflictError(`The field "${holder.key}" does not hold other fields. Only a group, or a list of groups, does.`);
    }
    return this.held(type.inner(holder.options, this.fields), rest);
  }

  /** The fields given, with `inner` in place of the fields at a place. */
  private holding(fields: readonly FieldDef[], within: readonly string[], inner: readonly FieldDef[]): FieldDef[] {
    const [id, ...rest] = within;
    if (id === undefined) return [...inner];
    return fields.map((field) => {
      if (field.id !== id) return field;
      const type = this.fields.get(field.type);
      const options = type.withInner(field.options, this.holding(type.inner(field.options, this.fields), rest, inner), this.fields);
      return options ? { ...field, options } : field;
    });
  }

  private replaceFields(actor: Actor, type: ContentTypeDef, within: readonly string[], fields: readonly FieldDef[]): Promise<ContentTypeDef> {
    return this.save(actor, { ...type, fields: this.holding(type.fields, within, fields) });
  }

  /** Sections whose fields are all live and shown once, or a refusal that names the section at fault. */
  private placed(sections: readonly FieldSection[], live: ReadonlyMap<string, FieldDef>): FieldSection[] {
    const shown = new Set<string>();
    for (const section of sections) {
      for (const id of section.fieldIds) {
        if (!live.has(id) || shown.has(id)) {
          throw new ValidationError(`Section "${section.key}" names a field that is not there, or that another section already shows.`, [
            { path: ['sections', section.key], message: `Unknown or repeated field "${id}"` },
          ]);
        }
        shown.add(id);
      }
    }
    return [...sections];
  }

  /** Refuses a path of field ids that does not lead to a live field. */
  private requirePath(fields: readonly FieldDef[], path: readonly string[]): void {
    let within: readonly FieldDef[] = fields;
    if (path.length === 0) throw new ValidationError('Choose a field.', [{ path: ['fields'], message: 'No field named' }]);
    for (const id of path) {
      const field = liveFields(within).find((candidate) => candidate.id === id);
      if (!field) {
        throw new ValidationError('That field is not part of this content type any more. Choose another.', [{ path: ['fields'], message: `Unknown field "${id}"` }]);
      }
      within = this.fields.get(field.type).inner(field.options);
    }
  }

  private async save(actor: Actor, type: ContentTypeDef): Promise<ContentTypeDef> {
    const saved = await this.types.save(type);
    await this.events.emit('type.saved', { type: saved, actor });
    return saved;
  }

  private requireFreeKey(fields: readonly FieldDef[], key: string): void {
    if (liveFields(fields).some((field) => field.key === key)) {
      throw new ConflictError(`This content type already has a field with the key "${key}".`);
    }
  }
}

function requireField(fields: readonly FieldDef[], fieldId: string): FieldDef {
  const field = fields.find((candidate) => candidate.id === fieldId);
  if (!field) throw new NotFoundError('Field', fieldId);
  return field;
}

/** Refuses a thing nobody could tell apart in the editor: one with no name in any language. */
function requireLabel(label: LocalizedText, what: string): void {
  if (!Object.values(label).some((text) => typeof text === 'string' && text.trim() !== '')) {
    throw new ValidationError(`Give the ${what} a name.`, [{ path: ['label'], message: 'A name is needed' }]);
  }
}

/** Refuses an address pattern that could not be a page of the site. */
function requirePattern(pattern: string): void {
  if (!/^\/[^\s?#]*$/.test(pattern) || pattern.startsWith('//')) {
    throw new ValidationError(`"${pattern}" can't be used as an address. Start with "/" and name the entry with [slug], such as /news/[slug].`, [
      { path: ['urlPattern'], message: 'Not an address on this site' },
    ]);
  }
}
