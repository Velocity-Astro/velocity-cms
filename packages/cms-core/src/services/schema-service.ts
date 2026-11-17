import type { AccessControl, Actor } from '../access.js';
import { defineField, defineFields, requireKey, type NewField } from '../define-fields.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import type { EventBus } from '../events.js';
import type { FieldType } from '../field-type.js';
import {
  liveFields,
  type ContentTypeDef,
  type ContentTypeKind,
  type FieldDef,
  type FieldSection,
  type LocalizedText,
} from '../model.js';
import type { Clock, IdGenerator, SchemaRepository } from '../ports.js';
import type { Registry } from '../registry.js';

export interface NewContentType {
  readonly key: string;
  readonly kind: ContentTypeKind;
  readonly label: LocalizedText;
  readonly urlPattern?: string;
  readonly fields?: readonly NewField[];
  /** The field entries are called by in lists, by key: `name`, or `address.street` inside a group. */
  readonly titleField?: string;
  /** How the editor lays the fields out, with fields named by key. */
  readonly sections?: readonly NewSection[];
}

export interface NewSection {
  readonly key: string;
  readonly label: LocalizedText;
  readonly fields: readonly string[];
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

  list(): Promise<ContentTypeDef[]> {
    return this.types.list();
  }

  async create(actor: Actor, input: NewContentType): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    requireKey(input.key, 'content type');
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

  async addField(actor: Actor, typeId: string, input: NewField): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const type = await this.get(typeId);
    this.requireFreeKey(type.fields, input.key);
    return this.save(actor, { ...type, fields: [...type.fields, defineField(input, undefined, this.context)] });
  }

  /** Changes a field's key or label. Its id, and so its data, stay as they are. */
  async renameField(
    actor: Actor,
    typeId: string,
    fieldId: string,
    change: { key?: string; label?: LocalizedText },
  ): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const type = await this.get(typeId);
    const field = this.requireField(type, fieldId);
    if (change.key !== undefined && change.key !== field.key) {
      requireKey(change.key, 'field');
      this.requireFreeKey(type.fields, change.key);
    }
    return this.replaceField(actor, type, {
      ...field,
      ...(change.key !== undefined && { key: change.key }),
      ...(change.label !== undefined && { label: change.label }),
    });
  }

  /** Hides a field from the editor and the site. Its data is kept, so `restoreField` undoes it. */
  async removeField(actor: Actor, typeId: string, fieldId: string): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const type = await this.get(typeId);
    const field = this.requireField(type, fieldId);
    if (field.deletedAt !== undefined) return type;
    return this.replaceField(actor, type, { ...field, deletedAt: this.clock.now() });
  }

  async restoreField(actor: Actor, typeId: string, fieldId: string): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const type = await this.get(typeId);
    const { deletedAt, ...field } = this.requireField(type, fieldId);
    if (deletedAt === undefined) return type;
    this.requireFreeKey(type.fields, field.key);
    return this.replaceField(actor, type, field);
  }

  private get context() {
    return { fields: this.fields, ids: this.ids };
  }

  /** A type with a description applied to it: its fields, what entries are called by, and its layout. */
  private described(type: ContentTypeDef, input: NewContentType): ContentTypeDef {
    const { titlePath: _title, sections: _sections, urlPattern: _url, ...rest } = type;
    const fields = defineFields(input.fields ?? [], type.fields, this.context);
    const live = liveFields(fields);
    const sections: FieldSection[] = (input.sections ?? []).map((section) => ({
      key: section.key,
      label: section.label,
      fieldIds: section.fields.map((key) => this.requireFieldByKey(live, key, `section "${section.key}"`).id),
    }));
    return {
      ...rest,
      label: input.label,
      ...(input.urlPattern !== undefined && { urlPattern: input.urlPattern }),
      fields,
      ...(input.titleField !== undefined && { titlePath: this.pathOf(live, input.titleField) }),
      ...(sections.length > 0 && { sections }),
    };
  }

  /** The ids along a dotted key path, such as `address.street`. */
  private pathOf(fields: readonly FieldDef[], keys: string): string[] {
    const path: string[] = [];
    let within = fields;
    for (const key of keys.split('.')) {
      const field = this.requireFieldByKey(within, key, `the title field "${keys}"`);
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

  private replaceField(actor: Actor, type: ContentTypeDef, field: FieldDef): Promise<ContentTypeDef> {
    const fields = type.fields.map((existing) => (existing.id === field.id ? field : existing));
    return this.save(actor, { ...type, fields });
  }

  private async save(actor: Actor, type: ContentTypeDef): Promise<ContentTypeDef> {
    const saved = await this.types.save(type);
    await this.events.emit('type.saved', { type: saved, actor });
    return saved;
  }

  private requireField(type: ContentTypeDef, fieldId: string): FieldDef {
    const field = type.fields.find((candidate) => candidate.id === fieldId);
    if (!field) throw new NotFoundError('Field', fieldId);
    return field;
  }

  private requireFreeKey(fields: readonly FieldDef[], key: string): void {
    if (liveFields(fields).some((field) => field.key === key)) {
      throw new ConflictError(`This content type already has a field with the key "${key}".`);
    }
  }
}
