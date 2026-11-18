import { liveFields, type FormDef } from '@velocity/cms-core';
import { Tag } from '@velocity/cms-ui';
import { useUpdateForm } from '../../client/queries.js';
import { FieldSetEditor } from '../../fields/FieldSetEditor.js';
import type { FieldSet } from '../../fields/field-set.js';
import { localized } from '../../lib/content.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

const ROLES = ['name', 'email', 'phone'] as const;

export interface FormFieldsProps {
  readonly form: FormDef;
  /** False for someone who may look and not change. */
  readonly mayChange: boolean;
}

/** What a form asks a visitor for, in order, with the ways to add, change, order and remove fields. */
export function FormFields({ form, mayChange }: FormFieldsProps) {
  const messages = useMessages();
  const locale = useLocale();
  const update = useUpdateForm();
  const set: FieldSet = {
    name: localized(form.label, locale),
    fields: liveFields(form.fields),
    isPending: update.isPending,
    // A form's fields are saved all at once, each with its id.
    save: (fields, handlers) => update.mutate({ id: form.id, changes: { fields, expectedRevision: form.revision } }, handlers),
    canRequire: true,
    tagsOf: (field) => ROLES.filter((role) => form.contact?.[role] === field.id).map((role) => <Tag key={role}>{messages.forms.holds[role]}</Tag>),
    words: { emptyDescription: messages.forms.noFieldsDescription, nameHelp: messages.forms.fieldNameHelp, removeDescription: messages.forms.removeDescription },
  };
  return <FieldSetEditor set={set} mayChange={mayChange} />;
}
