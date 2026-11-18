import type { FieldDef } from '@velocity/cms-core';
import { Button, Checkbox, Dialog, Form, Select, Text, TextField, toast } from '@velocity/cms-ui';
import { useState } from 'react';
import { AdminRequestError } from '../client/errors.js';
import { useFieldTypes } from '../client/queries.js';
import { fieldSettings, type FieldOptions } from './settings.js';
import { localized } from '../lib/content.js';
import { fieldKeyFrom } from '../lib/keys.js';
import { useClosing } from '../lib/use-closing.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { toInput, type FieldInput, type FieldSet } from './field-set.js';

const NO_PROBLEMS: Readonly<Record<string, string>> = {};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface FieldSetDialogProps {
  readonly set: FieldSet;
  /** The field to change. Left out, the window adds a new one. */
  readonly field?: FieldDef;
  readonly onClose: () => void;
}

/** The panel a field of a set is added or changed in: what it is called, its kind and its rules. */
export function FieldSetDialog({ set, field, onClose }: FieldSetDialogProps) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const locale = useLocale();
  const language = locale.split('-')[0] ?? locale;
  const fieldTypes = useFieldTypes();

  const [kind, setKind] = useState(field?.type ?? 'text');
  const [name, setName] = useState(field ? localized(field.label, locale) : '');
  // The key follows the label until someone writes a key of their own. An existing field keeps its key.
  const [ownKey, setOwnKey] = useState<string | null>(field?.key ?? null);
  const [help, setHelp] = useState(field?.help ? localized(field.help, locale) : '');
  const [isRequired, setRequired] = useState(field?.required ?? false);
  const [options, setOptions] = useState<FieldOptions>(field?.options ?? fieldSettings.get('text').initial);
  const [problems, setProblems] = useState(NO_PROBLEMS);

  const key = ownKey ?? fieldKeyFrom(name);
  const settings = fieldSettings.has(kind) ? fieldSettings.get(kind) : null;
  const kindName = (id: string) => messages.builder.kinds[id]?.name ?? id;
  // Only what a visitor can fill in, among the kinds that can be set up here.
  const kinds = (fieldTypes.data ?? []).filter((info) => info.takesSubmissions && fieldSettings.has(info.type)).map((info) => ({ id: info.type, label: kindName(info.type) }));

  const send = () => {
    const missing = {
      ...(name.trim() === '' && { label: messages.forms.fieldNameNeeded }),
      ...(key === '' && { key: messages.forms.fieldKeyNeeded }),
      ...(settings?.problem?.(options, messages) !== undefined && { options: settings.problem(options, messages) as string }),
    };
    setProblems(missing);
    if (Object.keys(missing).length > 0) return;
    const said = help.trim();
    const { help: _was, ...kept } = field ? toInput(field) : { key, type: kind, label: {} };
    const described: FieldInput = {
      ...kept,
      key,
      label: { ...field?.label, [language]: name.trim() },
      ...(said !== '' && { help: { ...field?.help, [language]: said } }),
      required: set.canRequire && isRequired,
      options,
    };
    const inputs = set.fields.map(toInput);
    set.save(field ? inputs.map((existing) => (existing.id === field.id ? described : existing)) : [...inputs, described], {
      onSuccess: () => {
        toast({ title: field ? messages.forms.fieldSaved(name.trim()) : messages.forms.fieldAdded(name.trim()), tone: 'success' });
        close();
      },
      onError: (error) => {
        // A key another field has is about the key. Anything else is about the settings.
        setProblems({ [error instanceof AdminRequestError && error.code === 'conflict' ? 'key' : 'options']: messageOf(error) });
        toast({ title: messages.forms.fieldNotSaved, description: messageOf(error), tone: 'danger' });
      },
    });
  };

  const title = field ? messages.forms.editFieldTitle(localized(field.label, locale)) : messages.forms.addFieldTitle;
  return (
    <Dialog
      {...dialog}
      placement="side"
      title={title}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={set.isPending} onPress={send}>
            {field ? messages.forms.fieldSave : messages.forms.fieldAdd}
          </Button>
        </>
      }
    >
      <Form label={title} gap={4} onSubmit={send}>
        {field ? (
          <Text size="sm" tone="muted">
            {messages.forms.fieldKindIs(kindName(kind))}
          </Text>
        ) : (
          <Select
            label={messages.forms.fieldKind}
            options={kinds}
            value={kind}
            description={messages.builder.kinds[kind]?.description ?? ''}
            onChange={(next) => {
              setKind(next);
              setOptions(fieldSettings.get(next).initial);
              setProblems(NO_PROBLEMS);
            }}
          />
        )}
        <TextField
          label={messages.forms.fieldName}
          description={set.words.nameHelp}
          value={name}
          onChange={setName}
          isRequired
          autoFocus
          autoComplete="off"
          {...(problems['label'] !== undefined && { errorMessage: problems['label'] })}
        />
        <TextField
          label={messages.forms.fieldKey}
          description={messages.forms.fieldKeyHelp}
          value={key}
          onChange={setOwnKey}
          isRequired
          autoComplete="off"
          {...(problems['key'] !== undefined && { errorMessage: problems['key'] })}
        />
        <TextField label={messages.forms.fieldHelp} description={messages.forms.fieldHelpHelp} value={help} onChange={setHelp} autoComplete="off" />
        {settings?.Component && <settings.Component options={options} onChange={setOptions} isExisting={field !== undefined} problem={problems['options']} />}
        {!settings?.Component && problems['options'] !== undefined && <Text tone="danger">{problems['options']}</Text>}
        {set.canRequire && <Checkbox label={messages.forms.fieldRequired} isSelected={isRequired} onChange={setRequired} />}
      </Form>
    </Dialog>
  );
}
