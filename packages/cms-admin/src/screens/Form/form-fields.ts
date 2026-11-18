import { liveFields, type FieldDef, type FormChanges, type FormDef } from '@velocity/cms-core';

/** A field as a change to a form sends it: with its id, so it keeps what was sent under it. */
export type FormFieldInput = NonNullable<FormChanges['fields']>[number];

export function toInput(field: FieldDef): FormFieldInput {
  return {
    id: field.id,
    key: field.key,
    type: field.type,
    label: field.label,
    ...(field.help !== undefined && { help: field.help }),
    required: field.required,
    options: field.options,
  };
}

/** Every field a form asks for now, as a change sends them: the whole list goes each time. */
export const inputsOf = (form: FormDef): FormFieldInput[] => liveFields(form.fields).map(toInput);

/** The list with one field moved one place up or down. */
export function movedBy(fields: readonly FormFieldInput[], id: string, by: -1 | 1): FormFieldInput[] {
  const from = fields.findIndex((field) => field.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= fields.length) return [...fields];
  const next = [...fields];
  const [field] = next.splice(from, 1);
  if (field) next.splice(to, 0, field);
  return next;
}

/** What a visitor answered, in words. */
export function answerText(value: unknown, yes: string): string {
  if (value === undefined || value === null) return '';
  if (value === true) return yes;
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : JSON.stringify(value);
}
