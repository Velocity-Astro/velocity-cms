import type { AccessControl, Actor } from '../access.js';
import { defineField, requireKey, type NewField } from '../define-fields.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import type { EventBus } from '../events.js';
import type { FieldType } from '../field-type.js';
import { liveFields, type FieldDef, type FormContactFields, type FormDef, type LocalizedText, type PublicForm } from '../model.js';
import type { Clock, FormRepository, IdGenerator, SubmissionRepository } from '../ports.js';
import type { Registry } from '../registry.js';

/** The fields that tie a submission to a person, named by field key. */
export interface FormContactKeys {
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
}

/** A form as someone describes it. The CMS assigns its id and its fields' ids. */
export interface NewForm {
  readonly key: string;
  readonly label: LocalizedText;
  readonly fields?: readonly NewField[];
  readonly submitLabel?: LocalizedText;
  readonly success?: LocalizedText;
  readonly notify?: readonly string[];
  readonly contact?: FormContactKeys;
  readonly retentionDays?: number;
  /** Defaults to true. */
  readonly open?: boolean;
}

/** What to change in a form. Anything left out stays as it is. */
export interface FormChanges {
  readonly key?: string;
  readonly label?: LocalizedText;
  /**
   * Every field the form now has, in order. A field keeps its id (and so what was sent under it)
   * by the `id` it is sent back with, or else by its key. One left out is marked removed.
   */
  readonly fields?: readonly (NewField & { readonly id?: string })[];
  /** `null` goes back to the template's own words. */
  readonly submitLabel?: LocalizedText | null;
  readonly success?: LocalizedText | null;
  readonly notify?: readonly string[];
  readonly contact?: FormContactKeys;
  /** `null` keeps submissions until someone deletes them. */
  readonly retentionDays?: number | null;
  readonly open?: boolean;
  /** The revision the editor loaded. The update is refused if someone saved in between. */
  readonly expectedRevision: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The longest a form may ask its submissions to be kept: ten years. */
export const MAX_RETENTION_DAYS = 3650;
export const MAX_FORM_FIELDS = 50;

/**
 * Owns forms: what each asks, and who hears of an answer. Every write takes the same four
 * steps as an entry's: check permission, validate, save, announce.
 */
export class FormService {
  constructor(
    private readonly forms: FormRepository,
    private readonly submissions: SubmissionRepository,
    private readonly fields: Registry<FieldType>,
    private readonly access: AccessControl,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** The site's forms, by key. A form says nothing about anyone, so whoever reads content reads these. */
  async list(actor: Actor): Promise<FormDef[]> {
    this.access.require(actor, 'entry:read');
    return this.forms.list();
  }

  async listTrashed(actor: Actor): Promise<FormDef[]> {
    this.access.require(actor, 'form:write');
    return this.forms.list({ trashed: true });
  }

  async get(actor: Actor, id: string): Promise<FormDef> {
    this.access.require(actor, 'entry:read');
    return this.load(id);
  }

  /**
   * The form a page draws, by key: its fields by key, removed ones left out. `null` when there
   * is no such form, or it is closed or in the trash, so a page leaves it out.
   */
  async forSite(key: string): Promise<PublicForm | null> {
    const form = await this.forms.getByKey(key);
    if (!form || !form.open) return null;
    return {
      key: form.key,
      label: form.label,
      fields: liveFields(form.fields).map(({ key: fieldKey, type, label, help, required, options }) => ({
        key: fieldKey,
        type,
        label,
        ...(help !== undefined && { help }),
        required,
        options,
      })),
      ...(form.submitLabel !== undefined && { submitLabel: form.submitLabel }),
      ...(form.success !== undefined && { success: form.success }),
    };
  }

  async create(actor: Actor, input: NewForm): Promise<FormDef> {
    this.access.require(actor, 'form:write');
    requireKey(input.key, 'form');
    const now = this.clock.now();
    const fields = this.described(input.fields ?? [], []);
    const form: FormDef = {
      id: this.ids.next(),
      key: input.key,
      label: input.label,
      fields,
      ...(input.submitLabel !== undefined && { submitLabel: input.submitLabel }),
      ...(input.success !== undefined && { success: input.success }),
      notify: addresses(input.notify ?? []),
      ...this.contact(input.contact, fields),
      ...(input.retentionDays !== undefined && { retentionDays: days(input.retentionDays) }),
      open: input.open ?? true,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    return this.save(actor, form, null);
  }

  async update(actor: Actor, id: string, change: FormChanges): Promise<FormDef> {
    this.access.require(actor, 'form:write');
    const current = await this.loadLive(id);
    if (current.revision !== change.expectedRevision) {
      throw new ConflictError(
        `This form was saved by someone else while you were editing. You have revision ${change.expectedRevision}; it is now at ${current.revision}.`,
      );
    }
    if (change.key !== undefined) requireKey(change.key, 'form');
    const fields = change.fields === undefined ? current.fields : this.described(change.fields, current.fields);
    // The marks are kept by field id, so they follow a field through a new key and go with one that is removed.
    const { contact: marked, submitLabel, success, retentionDays, ...rest } = current;
    const contact =
      change.contact !== undefined
        ? this.contact(change.contact, fields)
        : this.contactOf(marked, fields);
    const words = (changed: LocalizedText | null | undefined, was: LocalizedText | undefined) => (changed === undefined ? was : (changed ?? undefined));
    const nextSubmit = words(change.submitLabel, submitLabel);
    const nextSuccess = words(change.success, success);
    const nextDays = change.retentionDays === undefined ? retentionDays : change.retentionDays === null ? undefined : days(change.retentionDays);
    return this.save(
      actor,
      {
        ...rest,
        key: change.key ?? current.key,
        label: change.label ?? current.label,
        fields,
        ...(nextSubmit !== undefined && { submitLabel: nextSubmit }),
        ...(nextSuccess !== undefined && { success: nextSuccess }),
        notify: change.notify === undefined ? current.notify : addresses(change.notify),
        ...contact,
        ...(nextDays !== undefined && { retentionDays: nextDays }),
        open: change.open ?? current.open,
        revision: current.revision + 1,
        updatedAt: this.clock.now(),
      },
      current.revision,
    );
  }

  /** Moves a form to the trash: it takes no more submissions and its key is free. What was sent is kept. */
  async trash(actor: Actor, id: string): Promise<FormDef> {
    this.access.require(actor, 'form:write');
    const current = await this.load(id);
    if (current.deletedAt !== undefined) return current;
    const now = this.clock.now();
    const trashed = await this.forms.save({ ...current, revision: current.revision + 1, updatedAt: now, deletedAt: now }, current.revision);
    await this.events.emit('form.trashed', { form: trashed, actor });
    return trashed;
  }

  async restore(actor: Actor, id: string): Promise<FormDef> {
    this.access.require(actor, 'form:write');
    const current = await this.load(id);
    if (current.deletedAt === undefined) return current;
    if (await this.forms.getByKey(current.key)) {
      throw new ConflictError(`Another form uses the key "${current.key}" now. Change that form's key first, then restore this one.`);
    }
    const { deletedAt, ...rest } = current;
    const restored = await this.forms.save({ ...rest, revision: current.revision + 1, updatedAt: this.clock.now() }, current.revision);
    await this.events.emit('form.restored', { form: restored, actor });
    return restored;
  }

  /** Deletes a form in the trash for good, and with it everything that was sent through it. */
  async delete(actor: Actor, id: string): Promise<void> {
    this.access.require(actor, 'form:write');
    this.access.require(actor, 'submission:manage');
    const current = await this.load(id);
    if (current.deletedAt === undefined) {
      throw new ConflictError('Move this form to the trash first. Only a form in the trash can be deleted for good.');
    }
    await this.submissions.removeOfForm(id);
    await this.forms.remove(id);
    await this.events.emit('form.deleted', { form: current, actor });
  }

  /** The fields as they are stored: each a kind a visitor can fill in, ids kept, the ones left out marked removed. */
  private described(described: readonly (NewField & { readonly id?: string })[], previous: readonly FieldDef[]): FieldDef[] {
    if (described.length > MAX_FORM_FIELDS) {
      throw new ValidationError(`A form can have ${MAX_FORM_FIELDS} fields at most. This one has ${described.length}.`, [{ path: ['fields'], message: 'Too many fields' }]);
    }
    const now = this.clock.now();
    const context = { fields: this.fields, ids: this.ids, now };
    const live = liveFields(previous);
    const fields: FieldDef[] = [];
    for (const input of described) {
      if (fields.some((field) => field.key === input.key)) {
        throw new ConflictError(`This form already has a field with the key "${input.key}".`);
      }
      if (!this.fields.get(input.type).takesSubmissions) {
        const kinds = this.fields.list().filter((type) => type.takesSubmissions).map((type) => type.type).sort().join(', ');
        throw new ValidationError(`A form cannot ask for a ${input.type} field ("${input.key}"). A visitor can fill in: ${kinds}.`, [{ path: ['fields', input.key], message: 'Not a kind of field a form can have' }]);
      }
      const before = (input.id !== undefined && live.find((field) => field.id === input.id)) || live.find((field) => field.key === input.key && !described.some((other) => other.id === field.id));
      // Whatever was sent before under this id is of the kind it had then, so a new kind is a new field.
      const kept = before && before.type === input.type ? before : undefined;
      const { id: _sent, ...plain } = input;
      // One form is in one language on each page, so a field's value is never per language.
      fields.push({ ...defineField(plain, kept, context), translated: false });
    }
    const kept = new Set(fields.map((field) => field.id));
    return [...fields, ...previous.filter((field) => !kept.has(field.id)).map((field) => (field.deletedAt === undefined ? { ...field, deletedAt: now } : field))];
  }

  /** The marks by field id, from marks by key. Each must name a live field of the form. */
  private contact(keys: FormContactKeys | undefined, fields: readonly FieldDef[]): { contact?: FormContactFields } {
    if (keys === undefined) return {};
    const idOf = (role: 'name' | 'email' | 'phone') => {
      const key = keys[role];
      if (key === undefined) return {};
      const field = liveFields(fields).find((candidate) => candidate.key === key);
      if (!field) {
        throw new ValidationError(`The form has no field with the key "${key}" to hold the sender's ${role}.`, [{ path: ['contact', role], message: 'No such field' }]);
      }
      return { [role]: field.id };
    };
    const contact: FormContactFields = { ...idOf('name'), ...idOf('email'), ...idOf('phone') };
    return Object.keys(contact).length > 0 ? { contact } : {};
  }

  /** The marks that still name a live field. */
  private contactOf(marked: FormContactFields | undefined, fields: readonly FieldDef[]): { contact?: FormContactFields } {
    if (marked === undefined) return {};
    const live = new Set(liveFields(fields).map((field) => field.id));
    const contact = Object.fromEntries(Object.entries(marked).filter(([, id]) => live.has(id))) as FormContactFields;
    return Object.keys(contact).length > 0 ? { contact } : {};
  }

  private async save(actor: Actor, form: FormDef, expectedRevision: number | null): Promise<FormDef> {
    const saved = await this.forms.save(form, expectedRevision);
    await this.events.emit('form.saved', { form: saved, actor });
    return saved;
  }

  private async load(id: string): Promise<FormDef> {
    const form = await this.forms.get(id);
    if (!form) throw new NotFoundError('Form', id);
    return form;
  }

  private async loadLive(id: string): Promise<FormDef> {
    const form = await this.load(id);
    if (form.deletedAt !== undefined) throw new ConflictError('This form is in the trash. Restore it to change it.');
    return form;
  }
}

/** The addresses told of each submission: trimmed, lower case, each one once. */
function addresses(given: readonly string[]): string[] {
  const cleaned = [...new Set(given.map((address) => address.trim().toLowerCase()).filter((address) => address !== ''))];
  const wrong = cleaned.find((address) => !EMAIL.test(address) || address.length > 254);
  if (wrong !== undefined) {
    throw new ValidationError(`"${wrong}" is not an email address. Check who is told when this form is sent.`, [{ path: ['notify'], message: 'Not an email address' }]);
  }
  if (cleaned.length > 10) {
    throw new ValidationError('A form can tell 10 people at most. Use a shared address for more.', [{ path: ['notify'], message: 'Too many addresses' }]);
  }
  return cleaned;
}

function days(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_RETENTION_DAYS) {
    throw new ValidationError(`Submissions can be kept from 1 to ${MAX_RETENTION_DAYS} days. Leave it empty to keep them until someone deletes them.`, [{ path: ['retentionDays'], message: 'Out of range' }]);
  }
  return value;
}
