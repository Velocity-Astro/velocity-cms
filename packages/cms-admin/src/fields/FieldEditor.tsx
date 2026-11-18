import type { FieldDef } from '@velocity-astro/cms-core';
import { Fieldset } from '@velocity-astro/cms-ui';
import { useFieldTypes } from '../client/queries.js';
import { localized } from '../lib/content.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { useFieldControls } from './field-control.js';

export interface FieldEditorProps {
  readonly field: FieldDef;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  /** Where the field is in the entry, as field keys: `address.city`. */
  readonly path: string;
  readonly problems: ReadonlyMap<string, string>;
  /** True for a row of a list. */
  readonly isLabelHidden?: boolean;
}

/**
 * One field of an entry, drawn with the control its field type asks for. A field whose control
 * the editor does not have is shown by name, with a note, so nothing disappears silently.
 */
export function FieldEditor({ field, value, onChange, path, problems, isLabelHidden = false }: FieldEditorProps) {
  const messages = useMessages();
  const locale = useLocale();
  const controls = useFieldControls();
  const fieldTypes = useFieldTypes();

  const label = localized(field.label, locale);
  const editor = fieldTypes.data?.find((candidate) => candidate.type === field.type)?.editor;
  if (editor === undefined || !controls.has(editor)) {
    return <Fieldset legend={label} description={messages.editor.unsupportedField} />;
  }

  const { Component } = controls.get(editor);
  const help = field.help ? localized(field.help, locale) : undefined;
  return <Component field={field} label={label} help={help} isLabelHidden={isLabelHidden} value={value} onChange={onChange} path={path} problem={problems.get(path)} problems={problems} />;
}
