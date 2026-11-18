import type { AccessControl, Actor } from '../access.js';
import { defineField, type NewField } from '../define-fields.js';
import { ConflictError, ValidationError } from '../errors.js';
import type { EventBus } from '../events.js';
import type { FieldType } from '../field-type.js';
import { liveFields, type CustomFields, type EntryData, type FieldDef } from '../model.js';
import type { Clock, CustomFieldsStore, IdGenerator } from '../ports.js';
import type { Registry } from '../registry.js';
import { validateData } from '../schema-builder.js';

/** What custom fields are for: a contact, or a deal. */
export type CustomFieldsOf = 'contact' | 'deal';
export const CUSTOM_FIELDS_OF: readonly CustomFieldsOf[] = ['contact', 'deal'];

/** A field as the editor sends it. One sent back with its `id` keeps what was filled in under it. */
export type CustomFieldInput = NewField & { readonly id?: string };

export interface CustomFieldsChanges {
  /** Every field contacts are to have, in order. A field left out is marked removed. Left out, they stay as they are. */
  readonly contact?: readonly CustomFieldInput[];
  readonly deal?: readonly CustomFieldInput[];
  /** The revision the editor loaded. The save is refused if someone saved in between. */
  readonly expectedRevision: number;
}

export const MAX_CUSTOM_FIELDS = 30;

const WORDS: Readonly<Record<CustomFieldsOf, string>> = { contact: 'Contacts', deal: 'Deals' };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isEmpty = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/**
 * Owns the fields a site adds to its contacts and its deals, such as a gym's "Membership type".
 * They are described as a form's fields are, in the editor, and each keeps a permanent id: what
 * was filled in is kept by that id, so a rename loses nothing and a removed field's values stay.
 */
export class CustomFieldsService {
  constructor(
    private readonly store: CustomFieldsStore,
    private readonly fields: Registry<FieldType>,
    private readonly access: AccessControl,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async get(actor: Actor): Promise<CustomFields> {
    this.access.require(actor, 'contact:read');
    return this.current();
  }

  /** The fields as they stand, for a service that has already checked who is asking. */
  async current(): Promise<CustomFields> {
    return (await this.store.get()) ?? { contact: [], deal: [], revision: 0 };
  }

  async save(actor: Actor, changes: CustomFieldsChanges): Promise<CustomFields> {
    this.access.require(actor, 'contact:manage');
    const current = await this.current();
    if (current.revision !== changes.expectedRevision) throw new ConflictError('These fields were changed by someone else. Reload them and try again.');
    const next: CustomFields = {
      contact: changes.contact === undefined ? current.contact : this.described('contact', changes.contact, current.contact),
      deal: changes.deal === undefined ? current.deal : this.described('deal', changes.deal, current.deal),
      revision: current.revision + 1,
    };
    const saved = await this.store.save(next, current.revision === 0 ? null : current.revision);
    await this.events.emit('custom-fields.saved', { fields: saved, actor });
    return saved;
  }

  /**
   * What a contact or a deal holds in its custom fields after a change, by field id. `given` is
   * what was sent: a field it names is checked by its kind and replaced, or cleared when empty;
   * one it does not name stays as it was, and so does whatever a removed field held.
   */
  async values(of: CustomFieldsOf, given: unknown, previous: EntryData | undefined): Promise<EntryData | undefined> {
    if (given === undefined) return previous;
    if (!isRecord(given)) throw new ValidationError('The custom fields must be sent as values by field id.', [{ path: ['data'], message: 'Not a set of values.' }]);
    const live = liveFields((await this.current())[of]);
    const sent = Object.fromEntries(live.flatMap((field) => (field.id in given && !isEmpty(given[field.id]) ? [[field.id, given[field.id]]] : [])));
    let checked: EntryData;
    try {
      checked = validateData(live, sent, { fields: this.fields, mode: 'draft' });
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      // The same problems, said of this field set and under `data`, where the editor looks for them.
      const first = error.issues[0];
      throw new ValidationError(`This could not be saved: "${String(first?.path[0] ?? '')}" ${first?.message ?? 'is not filled in correctly.'}`, error.issues.map((issue) => ({ ...issue, path: ['data', ...issue.path] })));
    }
    const cleared = new Set(live.filter((field) => field.id in given).map((field) => field.id));
    const kept = Object.fromEntries(Object.entries(previous ?? {}).filter(([id]) => !cleared.has(id)));
    const next = { ...kept, ...checked };
    return Object.keys(next).length > 0 ? next : undefined;
  }

  /** What a record holds in the fields it has today, by field key: for a file handed to a person. */
  async byKey(of: CustomFieldsOf, data: EntryData | undefined): Promise<Record<string, unknown>> {
    if (data === undefined) return {};
    return Object.fromEntries(liveFields((await this.current())[of]).flatMap((field) => (data[field.id] === undefined ? [] : [[field.key, data[field.id]]])));
  }

  /** The fields as they are stored: each a simple kind, ids kept, the ones left out marked removed. */
  private described(of: CustomFieldsOf, described: readonly CustomFieldInput[], previous: readonly FieldDef[]): FieldDef[] {
    if (described.length > MAX_CUSTOM_FIELDS) {
      throw new ValidationError(`${WORDS[of]} can have ${MAX_CUSTOM_FIELDS} custom fields at most. There are ${described.length} here.`, [{ path: [of], message: 'Too many fields' }]);
    }
    const now = this.clock.now();
    const context = { fields: this.fields, ids: this.ids, now };
    const live = liveFields(previous);
    const fields: FieldDef[] = [];
    for (const input of described) {
      if (fields.some((field) => field.key === input.key)) throw new ConflictError(`${WORDS[of]} already have a field with the key "${input.key}".`);
      // The kinds a visitor can fill in are the simple ones: one value, with a control of its own.
      if (!this.fields.has(input.type) || !this.fields.get(input.type).takesSubmissions) {
        const kinds = this.fields.list().filter((type) => type.takesSubmissions).map((type) => type.type).sort().join(', ');
        throw new ValidationError(`A custom field cannot be a ${input.type} field ("${input.key}"). It can be: ${kinds}.`, [{ path: [of, input.key], message: 'Not a kind of field this can be' }]);
      }
      const before = (input.id !== undefined && live.find((field) => field.id === input.id)) || live.find((field) => field.key === input.key && !described.some((other) => other.id === field.id));
      // What was filled in under this id is of the kind it had then, so a new kind is a new field.
      const kept = before && before.type === input.type ? before : undefined;
      const { id: _sent, ...plain } = input;
      // A contact made by a form cannot be asked for more, so no custom field is ever required.
      fields.push({ ...defineField(plain, kept, context), translated: false, required: false });
    }
    const kept = new Set(fields.map((field) => field.id));
    return [...fields, ...previous.filter((field) => !kept.has(field.id)).map((field) => (field.deletedAt === undefined ? { ...field, deletedAt: now } : field))];
  }
}
