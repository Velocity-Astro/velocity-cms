import type { AccessControl, Actor } from '../access.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import type { EventBus } from '../events.js';
import type { FieldType } from '../field-type.js';
import {
  liveFields,
  type ContentTypeDef,
  type ContentTypeKind,
  type FieldDef,
  type LocalizedText,
} from '../model.js';
import type { Clock, IdGenerator, SchemaRepository } from '../ports.js';
import type { Registry } from '../registry.js';

/** A field as someone describes it when adding it. The service assigns the id. */
export interface NewField {
  readonly key: string;
  readonly type: string;
  readonly label: LocalizedText;
  readonly translated?: boolean;
  readonly required?: boolean;
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface NewContentType {
  readonly key: string;
  readonly kind: ContentTypeKind;
  readonly label: LocalizedText;
  readonly urlPattern?: string;
  readonly fields?: readonly NewField[];
}

const KEY = /^[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*$/;

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
    this.requireKey(input.key, 'content type');

    const fields: FieldDef[] = [];
    for (const field of input.fields ?? []) {
      fields.push(this.defineField(fields, field));
    }
    const type: ContentTypeDef = {
      id: this.ids.next(),
      key: input.key,
      kind: input.kind,
      label: input.label,
      ...(input.urlPattern !== undefined && { urlPattern: input.urlPattern }),
      fields,
    };
    return this.save(actor, type);
  }

  async addField(actor: Actor, typeId: string, input: NewField): Promise<ContentTypeDef> {
    this.access.require(actor, 'schema:write');
    const type = await this.get(typeId);
    return this.save(actor, { ...type, fields: [...type.fields, this.defineField(type.fields, input)] });
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
      this.requireKey(change.key, 'field');
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

  private defineField(existing: readonly FieldDef[], input: NewField): FieldDef {
    this.requireKey(input.key, 'field');
    this.requireFreeKey(existing, input.key);
    const type = this.fields.get(input.type);
    const options = type.options.safeParse(input.options ?? {});
    if (!options.success) {
      throw new ValidationError(
        `The settings for field "${input.key}" are not valid for a ${input.type} field.`,
        options.error.issues.map((issue) => ({
          path: issue.path.map((segment) => (typeof segment === 'symbol' ? String(segment) : segment)),
          message: issue.message,
        })),
      );
    }
    return {
      id: this.ids.next(),
      key: input.key,
      type: input.type,
      label: input.label,
      translated: input.translated ?? true,
      required: input.required ?? false,
      options: input.options ?? {},
    };
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

  private requireKey(key: string, what: string): void {
    if (!KEY.test(key)) {
      throw new ValidationError(
        `"${key}" can't be used as a ${what} key. Start with a lowercase letter and use letters, numbers and single hyphens.`,
        [{ path: ['key'], message: 'Invalid key' }],
      );
    }
  }

  private requireFreeKey(fields: readonly FieldDef[], key: string): void {
    if (liveFields(fields).some((field) => field.key === key)) {
      throw new ConflictError(`This content type already has a field with the key "${key}".`);
    }
  }
}
