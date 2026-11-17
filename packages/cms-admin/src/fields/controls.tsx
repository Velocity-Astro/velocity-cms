import { liveFields, type FieldDef } from '@velocity/cms-core';
import { DateField, Fieldset, NumberField, Select, Switch, Text, TextArea, TextField } from '@velocity/cms-ui';
import { withValue } from '../lib/content.js';
import { useMessages } from '../messages/messages-context.js';
import { createFieldControlRegistry, type FieldControlProps, type FieldControls } from './field-control.js';
import { FieldEditor } from './FieldEditor.js';

/** A field setting, when it is a number. Settings are checked by the server, not here. */
function numberOption(field: FieldDef, name: string): number | undefined {
  const option = field.options[name];
  return typeof option === 'number' ? option : undefined;
}

function TextControl({ field, label, value, onChange, problem }: FieldControlProps) {
  const shared = {
    label,
    value: typeof value === 'string' ? value : '',
    onChange: (next: string) => onChange(next === '' ? undefined : next),
    isRequired: field.required,
    ...(problem !== undefined && { errorMessage: problem }),
  };
  return field.options['multiline'] === true ? <TextArea {...shared} /> : <TextField {...shared} />;
}

function UrlControl({ field, label, value, onChange, problem }: FieldControlProps) {
  return (
    <TextField
      type="url"
      label={label}
      value={typeof value === 'string' ? value : ''}
      onChange={(next) => onChange(next === '' ? undefined : next)}
      isRequired={field.required}
      {...(problem !== undefined && { errorMessage: problem })}
    />
  );
}

function NumberControl({ field, label, value, onChange, problem }: FieldControlProps) {
  const min = numberOption(field, 'min');
  const max = numberOption(field, 'max');
  return (
    <NumberField
      label={label}
      value={typeof value === 'number' ? value : null}
      onChange={(next) => onChange(next ?? undefined)}
      isInteger={field.options['integer'] === true}
      isRequired={field.required}
      {...(min !== undefined && { minValue: min })}
      {...(max !== undefined && { maxValue: max })}
      {...(problem !== undefined && { errorMessage: problem })}
    />
  );
}

function DateControl({ field, label, value, onChange, problem }: FieldControlProps) {
  return (
    <DateField
      label={label}
      value={typeof value === 'string' ? value : null}
      onChange={(next) => onChange(next ?? undefined)}
      isRequired={field.required}
      {...(problem !== undefined && { errorMessage: problem })}
    />
  );
}

function SwitchControl({ label, value, onChange }: FieldControlProps) {
  return <Switch label={label} isSelected={value === true} onChange={onChange} />;
}

function SelectControl({ field, label, value, onChange, problem }: FieldControlProps) {
  const messages = useMessages();
  const choices = Array.isArray(field.options['choices']) ? field.options['choices'].filter((choice) => typeof choice === 'string') : [];
  return (
    <Select
      label={label}
      options={choices.map((choice) => ({ id: choice, label: choice }))}
      placeholder={messages.editor.choose}
      onChange={onChange}
      isRequired={field.required}
      width="md"
      {...(typeof value === 'string' && { value })}
      {...(problem !== undefined && { errorMessage: problem })}
    />
  );
}

/** Several fields kept together as one value. Each is drawn by its own control, so groups nest. */
function GroupControl({ field, label, value, onChange, path, problem, problems }: FieldControlProps) {
  const inner = Array.isArray(field.options['fields']) ? liveFields(field.options['fields'] as FieldDef[]) : [];
  const values = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return (
    <Fieldset legend={label}>
      {problem !== undefined && (
        <Text size="sm" tone="danger">
          {problem}
        </Text>
      )}
      {inner.map((child) => (
        <FieldEditor
          key={child.id}
          field={child}
          value={values[child.id]}
          onChange={(next) => {
            const changed = withValue(values, child.id, next);
            // A group with nothing in it is an empty field, not a value with empty parts.
            onChange(Object.keys(changed).length === 0 ? undefined : changed);
          }}
          path={`${path}.${child.key}`}
          problems={problems}
        />
      ))}
    </Fieldset>
  );
}

/** The controls for the field types every site has. A site or plugin registers more on the result. */
export function createFieldControls(): FieldControls {
  return createFieldControlRegistry()
    .register({ type: 'text-input', Component: TextControl })
    .register({ type: 'url-input', Component: UrlControl })
    .register({ type: 'number-input', Component: NumberControl })
    .register({ type: 'date-picker', Component: DateControl })
    .register({ type: 'switch', Component: SwitchControl })
    .register({ type: 'select', Component: SelectControl })
    .register({ type: 'group', Component: GroupControl });
}
