import type { ContentTypeDef, FieldDef } from '@velocity-astro/cms-core';
import { Button, Checkbox, Dialog, Form, Select, Text, TextField, toast } from '@velocity-astro/cms-ui';
import { useState } from 'react';
import { AdminRequestError } from '../../client/errors.js';
import { useAddField, useChangeField, useFieldTypes } from '../../client/queries.js';
import { fieldSettings, type FieldOptions } from '../../fields/settings.js';
import { NO_SECTION, placeOf, placed } from '../../lib/arrangement.js';
import { localized } from '../../lib/content.js';
import { fieldKeyFrom } from '../../lib/keys.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { useClosing } from '../../lib/use-closing.js';

const NO_PROBLEMS: Readonly<Record<string, string>> = {};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface FieldDialogProps {
  readonly type: ContentTypeDef;
  /** The field to change. Left out, the window adds a new one. */
  readonly field?: FieldDef;
  /** The fields that hold this one, by id from the top down. Empty for one of the type's own. */
  readonly within: readonly string[];
  readonly onClose: () => void;
}

/** The panel a field is added or changed in: what it is called, its kind, its rules and its settings. */
export function FieldDialog({ type, field, within, onClose }: FieldDialogProps) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const locale = useLocale();
  const language = locale.split('-')[0] ?? locale;
  const fieldTypes = useFieldTypes();
  const add = useAddField();
  const change = useChangeField();

  const [kind, setKind] = useState(field?.type ?? 'text');
  const [name, setName] = useState(field ? localized(field.label, locale) : '');
  // The key follows the name until someone writes a key of their own. An existing field keeps its key.
  const [ownKey, setOwnKey] = useState<string | null>(field?.key ?? null);
  const [help, setHelp] = useState(field?.help ? localized(field.help, locale) : '');
  const [isRequired, setRequired] = useState(field?.required ?? false);
  const [isTranslated, setTranslated] = useState(field?.translated ?? true);
  // Sections lay out a type's own fields. What a group holds is shown in the group.
  const isInside = within.length > 0;
  const [section, setSection] = useState(field ? placeOf(type, field.id) : (type.sections?.[0]?.key ?? NO_SECTION));
  const [options, setOptions] = useState<FieldOptions>(field?.options ?? fieldSettings.get('text').initial);
  const [problems, setProblems] = useState(NO_PROBLEMS);

  const key = ownKey ?? fieldKeyFrom(name);
  const settings = fieldSettings.has(kind) ? fieldSettings.get(kind) : null;
  const kindName = (id: string) => messages.builder.kinds[id]?.name ?? id;
  // Only kinds that can be set up here are offered, among those the site really has.
  const kinds = (fieldTypes.data ?? []).filter((info) => fieldSettings.has(info.type)).map((info) => ({ id: info.type, label: kindName(info.type) }));
  const sections = [...(type.sections ?? []).map((item) => ({ id: item.key, label: localized(item.label, locale) })), { id: NO_SECTION, label: messages.builder.noSection }];
  const isPending = add.isPending || change.isPending;

  const refused = (title: string) => (error: unknown) => {
    const issues = error instanceof AdminRequestError ? error.issues : [];
    const about = issues.map((issue) => String(issue.path[0] ?? '')).find((where) => where === 'key' || where === 'label');
    // What the server said about the key or the name goes there. Anything else is about the settings.
    setProblems({ [about ?? (error instanceof AdminRequestError && error.code === 'conflict' ? 'key' : 'options')]: messageOf(error) });
    toast({ title, description: messageOf(error), tone: 'danger' });
  };

  const send = () => {
    const missing = {
      ...(name.trim() === '' && { label: messages.builder.nameNeeded }),
      ...(key === '' && { key: messages.builder.keyNeeded }),
      ...(settings?.problem?.(options, messages) !== undefined && { options: settings.problem(options, messages) as string }),
    };
    setProblems(missing);
    if (Object.keys(missing).length > 0) return;
    const said = help.trim();
    if (!field) {
      add.mutate(
        {
          typeId: type.id,
          within,
          field: {
            key,
            type: kind,
            label: { [language]: name.trim() },
            ...(said !== '' && { help: { [language]: said } }),
            required: isRequired,
            translated: isTranslated,
            options,
            ...(!isInside && section !== NO_SECTION && { section }),
          },
        },
        {
          onSuccess: () => {
            toast({ title: messages.builder.fieldAdded(name.trim()), tone: 'success' });
            close();
          },
          onError: refused(messages.builder.fieldNotAdded),
        },
      );
      return;
    }
    change.mutate(
      {
        typeId: type.id,
        fieldId: field.id,
        within,
        changes: {
          key,
          label: { ...field.label, [language]: name.trim() },
          help: said === '' ? null : { ...field.help, [language]: said },
          required: isRequired,
          translated: isTranslated,
          options,
        },
        ...(!isInside && section !== placeOf(type, field.id) && { arrangement: placed(type, field.id, section) }),
      },
      {
        onSuccess: () => {
          toast({ title: messages.builder.fieldSaved(name.trim()), tone: 'success' });
          close();
        },
        onError: refused(messages.builder.fieldNotSaved),
      },
    );
  };

  const title = field ? messages.builder.editFieldTitle(localized(field.label, locale)) : messages.builder.addFieldTitle;
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
          <Button isPending={isPending} onPress={send}>
            {field ? messages.builder.fieldSave : messages.builder.fieldAdd}
          </Button>
        </>
      }
    >
      <Form label={title} gap={4} onSubmit={send}>
        {field ? (
          <Text size="sm" tone="muted">
            {messages.builder.kindIs(kindName(kind))}
          </Text>
        ) : (
          <Select
            label={messages.builder.kind}
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
          label={messages.builder.fieldName}
          description={messages.builder.fieldNameHelp}
          value={name}
          onChange={setName}
          isRequired
          autoFocus
          autoComplete="off"
          {...(problems['label'] !== undefined && { errorMessage: problems['label'] })}
        />
        <TextField
          label={messages.builder.fieldKey}
          description={field ? messages.builder.fieldKeyHelpEdit : messages.builder.fieldKeyHelp}
          value={key}
          onChange={setOwnKey}
          isRequired
          autoComplete="off"
          {...(problems['key'] !== undefined && { errorMessage: problems['key'] })}
        />
        <TextField label={messages.builder.fieldHelp} description={messages.builder.fieldHelpHelp} value={help} onChange={setHelp} autoComplete="off" />
        {settings?.Component && <settings.Component options={options} onChange={setOptions} isExisting={field !== undefined} problem={problems['options']} />}
        {!settings?.Component && problems['options'] !== undefined && <Text tone="danger">{problems['options']}</Text>}
        {field && !settings && (
          <Text size="sm" tone="muted">
            {messages.builder.settingsElsewhere}
          </Text>
        )}
        <Checkbox label={messages.builder.fieldRequired} isSelected={isRequired} onChange={setRequired} />
        <Checkbox label={messages.builder.fieldTranslated} isSelected={isTranslated} onChange={setTranslated} />
        {!isInside && sections.length > 1 && <Select label={messages.builder.section} description={messages.builder.sectionHelp} options={sections} value={section} onChange={setSection} />}
      </Form>
    </Dialog>
  );
}
