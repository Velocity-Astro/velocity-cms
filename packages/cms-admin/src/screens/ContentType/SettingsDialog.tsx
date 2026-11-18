import { liveFields, type ContentTypeDef, type FieldDef } from '@velocity-astro/cms-core';
import { Button, Checkbox, Dialog, Fieldset, Form, Select, TextField, toast } from '@velocity-astro/cms-ui';
import { useState } from 'react';
import { AdminRequestError } from '../../client/errors.js';
import { useFieldTypes, useUpdateContentType } from '../../client/queries.js';
import { innerFields } from '../../fields/settings.js';
import { localized } from '../../lib/content.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { useClosing } from '../../lib/use-closing.js';

const AUTOMATIC = '';
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** A path of field ids as one word, for a choice in a list. No id holds a slash. */
const wordOf = (path: readonly string[]) => path.join('/');

/** The window a content type's name, address and place in lists are changed in. */
export function SettingsDialog({ type, onClose }: { readonly type: ContentTypeDef; readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const locale = useLocale();
  const update = useUpdateContentType();
  const fieldTypes = useFieldTypes();
  const [name, setName] = useState(localized(type.label, locale));
  const [address, setAddress] = useState(type.urlPattern ?? '');
  const [title, setTitle] = useState(type.titlePath ? wordOf(type.titlePath) : AUTOMATIC);
  const [image, setImage] = useState(type.list?.imagePath ? wordOf(type.list.imagePath) : AUTOMATIC);
  const [columns, setColumns] = useState<readonly string[]>((type.list?.fieldPaths ?? []).map(wordOf));
  const [forDeals, setForDeals] = useState(type.forDeals === true);
  const [problems, setProblems] = useState<Readonly<Record<string, string>>>({});

  const own = liveFields([...type.fields]);
  /** What a path is called: `Address, City` for a field inside a group. */
  const labelOf = (path: readonly string[]): string => {
    const names: string[] = [];
    let fields: readonly FieldDef[] = type.fields;
    for (const id of path) {
      const field = fields.find((candidate) => candidate.id === id);
      if (!field) return wordOf(path);
      names.push(localized(field.label, locale));
      fields = innerFields(field) ?? [];
    }
    return names.join(', ');
  };
  // The type's own fields, and whatever is chosen already, which a template may have taken from inside a group.
  const choices = (chosen: readonly string[], fields: readonly FieldDef[] = own) =>
    [...new Set([...fields.map((field) => field.id), ...chosen.filter((word) => word !== AUTOMATIC)])].map((word) => ({ id: word, label: labelOf(word.split('/')) }));
  const editorOf = new Map((fieldTypes.data ?? []).map((info) => [info.type, info.editor]));
  const pictures = own.filter((field) => editorOf.get(field.type) === 'image');

  const send = () => {
    if (name.trim() === '') return setProblems({ label: messages.builder.typeNameNeeded });
    setProblems({});
    update.mutate(
      {
        id: type.id,
        changes: {
          label: { ...type.label, [locale.split('-')[0] ?? locale]: name.trim() },
          urlPattern: address.trim() === '' ? null : address.trim(),
          titlePath: title === AUTOMATIC ? null : title.split('/'),
          list: image === AUTOMATIC && columns.length === 0 ? null : { ...(image !== AUTOMATIC && { imagePath: image.split('/') }), ...(columns.length > 0 && { fieldPaths: columns.map((word) => word.split('/')) }) },
          forDeals,
        },
      },
      {
        onSuccess: () => {
          toast({ title: messages.builder.settingsSaved, tone: 'success' });
          close();
        },
        onError: (error) => {
          const issues = error instanceof AdminRequestError ? error.issues : [];
          setProblems({ [String(issues[0]?.path[0] ?? 'urlPattern')]: messageOf(error) });
          toast({ title: messages.builder.settingsNotSaved, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  const heading = messages.builder.settingsTitle(localized(type.label, locale));
  return (
    <Dialog
      {...dialog}
      placement="side"
      title={heading}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={update.isPending} onPress={send}>
            {messages.builder.settingsSave}
          </Button>
        </>
      }
    >
      <Form label={heading} gap={4} onSubmit={send}>
        <TextField label={messages.builder.typeName} value={name} onChange={setName} isRequired autoFocus autoComplete="off" {...(problems['label'] !== undefined && { errorMessage: problems['label'] })} />
        <TextField
          label={messages.builder.typeAddress}
          description={messages.builder.typeAddressHelp}
          value={address}
          onChange={setAddress}
          autoComplete="off"
          {...(problems['urlPattern'] !== undefined && { errorMessage: problems['urlPattern'] })}
        />
        <Select
          label={messages.builder.titleField}
          description={messages.builder.titleFieldHelp}
          options={[{ id: AUTOMATIC, label: messages.builder.titleAutomatic }, ...choices([title])]}
          value={title}
          onChange={setTitle}
          {...(problems['fields'] !== undefined && { errorMessage: problems['fields'] })}
        />
        <Select
          label={messages.builder.listImage}
          description={messages.builder.listImageHelp}
          options={[{ id: AUTOMATIC, label: messages.builder.listImageNone }, ...choices([image], pictures)]}
          value={image}
          onChange={setImage}
        />
        <Fieldset legend={messages.builder.listColumns} description={messages.builder.listColumnsHelp}>
          {choices(columns).map((choice) => (
            <Checkbox
              key={choice.id}
              label={choice.label}
              isSelected={columns.includes(choice.id)}
              onChange={(isSelected) => setColumns((all) => (isSelected ? [...all, choice.id] : all.filter((word) => word !== choice.id)))}
            />
          ))}
        </Fieldset>
        <Fieldset legend={messages.builder.crm} description={messages.builder.forDealsHelp}>
          <Checkbox label={messages.builder.forDeals} isSelected={forDeals} onChange={setForDeals} />
        </Fieldset>
      </Form>
    </Dialog>
  );
}
