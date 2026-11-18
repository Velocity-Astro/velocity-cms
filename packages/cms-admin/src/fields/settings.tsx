import { Registry, type FieldDef } from '@velocity/cms-core';
import { Checkbox, NumberField, Select, TextArea } from '@velocity/cms-ui';
import { useState, type ComponentType } from 'react';
import { useContentTypes } from '../client/queries.js';
import { localized } from '../lib/content.js';
import type { Messages } from '../messages/en.js';
import { useLocale, useMessages } from '../messages/messages-context.js';

/** A field type's settings, as they are stored in a field's `options`. */
export type FieldOptions = Readonly<Record<string, unknown>>;

/** What a settings form is given. */
export interface FieldSettingsProps {
  readonly options: FieldOptions;
  readonly onChange: (options: FieldOptions) => void;
  /** True for a field that already exists, whose content some settings must not strand. */
  readonly isExisting: boolean;
  /** What is wrong with the settings, to show where it belongs. */
  readonly problem: string | undefined;
}

/**
 * How one kind of field is set up in the content type builder. Like a field's control, it is
 * looked up by the field type's name, so nothing in the builder asks which type a field is. A
 * plugin's field type brings its own settings the same way. A type with no entry here can still
 * be renamed and reordered; its settings are kept as they are.
 */
export interface FieldSettings {
  /** The field type's name: `text`. */
  readonly type: string;
  /** The settings a new field of this kind starts with. */
  readonly initial: FieldOptions;
  /** The form for its settings, for a kind that has any. */
  readonly Component?: ComponentType<FieldSettingsProps>;
  /** What is still missing before the field can be saved, in words for the person. */
  readonly problem?: (options: FieldOptions, messages: Messages) => string | undefined;
  /** True when a list can hold items of this kind. */
  readonly canBeListed?: boolean;
  /** The fields a field of this kind holds, for a kind that holds fields: a group, a list of groups. */
  readonly inner?: (options: FieldOptions) => readonly FieldDef[] | null;
}

export type FieldSettingsRegistry = Registry<FieldSettings>;

const numberOf = (value: unknown): number | null => (typeof value === 'number' ? value : null);
/** The options with one setting changed, or taken out when it is emptied. */
const withSetting = (options: FieldOptions, key: string, value: unknown): FieldOptions => {
  const { [key]: _old, ...rest } = options;
  return value === null || value === undefined ? rest : { ...rest, [key]: value };
};

function TextSettings({ options, onChange }: FieldSettingsProps) {
  const messages = useMessages();
  return (
    <>
      <Checkbox label={messages.builder.textMultiline} isSelected={options['multiline'] === true} onChange={(multiline) => onChange(withSetting(options, 'multiline', multiline))} />
      <NumberField
        label={messages.builder.textMaxLength}
        description={messages.builder.textMaxLengthHelp}
        value={numberOf(options['maxLength'])}
        minValue={1}
        isInteger
        onChange={(maxLength) => onChange(withSetting(options, 'maxLength', maxLength))}
      />
    </>
  );
}

function NumberSettings({ options, onChange }: FieldSettingsProps) {
  const messages = useMessages();
  return (
    <>
      <NumberField label={messages.builder.numberMin} value={numberOf(options['min'])} onChange={(min) => onChange(withSetting(options, 'min', min))} />
      <NumberField label={messages.builder.numberMax} value={numberOf(options['max'])} onChange={(max) => onChange(withSetting(options, 'max', max))} />
      <Checkbox label={messages.builder.numberInteger} isSelected={options['integer'] === true} onChange={(integer) => onChange(withSetting(options, 'integer', integer))} />
    </>
  );
}

/** The options someone wrote, one per line, without empty lines or repeats. */
const choicesOf = (text: string): string[] => [...new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))];

function SelectSettings({ options, onChange, problem }: FieldSettingsProps) {
  const messages = useMessages();
  // What was typed is kept as typed, so a line can be empty while it is being written.
  const [typed, setTyped] = useState(() => ((options['choices'] as string[] | undefined) ?? []).join('\n'));
  return (
    <TextArea
      label={messages.builder.choices}
      description={messages.builder.choicesHelp}
      rows={5}
      isRequired
      value={typed}
      onChange={(text) => {
        setTyped(text);
        onChange({ ...options, choices: choicesOf(text) });
      }}
      {...(problem !== undefined && { errorMessage: problem })}
    />
  );
}

function ReferenceSettings({ options, onChange, problem }: FieldSettingsProps) {
  const messages = useMessages();
  const locale = useLocale();
  const types = useContentTypes();
  return (
    <Select
      label={messages.builder.referenceTo}
      isRequired
      options={(types.data ?? []).map((type) => ({ id: type.key, label: localized(type.label, locale) }))}
      {...(typeof options['to'] === 'string' && options['to'] !== '' && { value: options['to'] })}
      onChange={(to) => onChange({ ...options, to })}
      {...(problem !== undefined && { errorMessage: problem })}
    />
  );
}

function ListSettings({ options, onChange, isExisting, problem }: FieldSettingsProps) {
  const messages = useMessages();
  const of = options['of'] as { type?: string } | undefined;
  // Asked of the registry in use, so a plugin's kinds can be listed too.
  const kinds = fieldSettings.list().filter((entry) => entry.canBeListed === true || entry.type === of?.type);
  return (
    <Select
      label={messages.builder.listOf}
      description={messages.builder.listOfHelp}
      isRequired
      isDisabled={isExisting}
      options={kinds.map((entry) => ({ id: entry.type, label: messages.builder.kinds[entry.type]?.name ?? entry.type }))}
      {...(of?.type !== undefined && { value: of.type })}
      onChange={(type) => onChange({ ...options, of: { type, options: fieldSettings.get(type).initial } })}
      {...(problem !== undefined && { errorMessage: problem })}
    />
  );
}

/** The settings of every built-in field type that can be set up by hand. */
export const fieldSettings: FieldSettingsRegistry = new Registry<FieldSettings>('field settings')
  .register({ type: 'text', initial: {}, Component: TextSettings, canBeListed: true })
  .register({ type: 'richtext', initial: {}, canBeListed: true })
  .register({ type: 'number', initial: {}, Component: NumberSettings, canBeListed: true })
  .register({ type: 'boolean', initial: {} })
  .register({ type: 'date', initial: {}, canBeListed: true })
  .register({ type: 'url', initial: {}, canBeListed: true })
  .register({ type: 'email', initial: {}, canBeListed: true })
  .register({ type: 'phone', initial: {}, canBeListed: true })
  .register({
    type: 'select',
    initial: { choices: [] },
    Component: SelectSettings,
    problem: (options, messages) => (((options['choices'] as unknown[] | undefined) ?? []).length === 0 ? messages.builder.choicesNeeded : undefined),
  })
  .register({ type: 'image', initial: {}, canBeListed: true })
  .register({
    type: 'reference',
    initial: {},
    Component: ReferenceSettings,
    problem: (options, messages) => (typeof options['to'] === 'string' && options['to'] !== '' ? undefined : messages.builder.referenceNeeded),
  })
  .register({ type: 'link', initial: {}, canBeListed: true })
  .register({
    type: 'group',
    initial: { fields: [] },
    canBeListed: true,
    inner: (options) => (Array.isArray(options['fields']) ? (options['fields'] as FieldDef[]) : []),
  })
  .register({
    type: 'list',
    initial: {},
    Component: ListSettings,
    // A list holds fields when its items do.
    inner: (options) => {
      const of = options['of'] as { type?: string; options?: FieldOptions } | undefined;
      return of?.type !== undefined && fieldSettings.has(of.type) ? (fieldSettings.get(of.type).inner?.(of.options ?? {}) ?? null) : null;
    },
    problem: (options, messages) => (typeof (options['of'] as { type?: unknown } | undefined)?.type === 'string' ? undefined : messages.builder.listOfNeeded),
  });

/** The fields a field holds, or `null` when it is not of a kind that holds any. */
export function innerFields(field: FieldDef): readonly FieldDef[] | null {
  return fieldSettings.has(field.type) ? (fieldSettings.get(field.type).inner?.(field.options) ?? null) : null;
}
