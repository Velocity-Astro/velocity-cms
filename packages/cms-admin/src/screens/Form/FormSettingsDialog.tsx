import { liveFields, type FormDef } from '@velocity/cms-core';
import { Button, Dialog, Form, NumberField, Select, Switch, Text, TextArea, TextField, toast } from '@velocity/cms-ui';
import { useState } from 'react';
import { AdminRequestError } from '../../client/errors.js';
import { useCustomFields, useUpdateForm } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { useClosing } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

const NO_PROBLEMS: Readonly<Record<string, string>> = {};
const NONE = ':none';
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface FormSettingsDialogProps {
  readonly form: FormDef;
  readonly onClose: () => void;
}

/** The panel for what a form is called, who hears of an answer, which fields say who sent it, and how long answers are kept. */
export function FormSettingsDialog({ form, onClose }: FormSettingsDialogProps) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const locale = useLocale();
  const language = locale.split('-')[0] ?? locale;
  const update = useUpdateForm();
  const fields = liveFields(form.fields);
  const keyOf = (id: string | undefined) => fields.find((field) => field.id === id)?.key ?? NONE;

  const [name, setName] = useState(localized(form.label, locale));
  const [isOpen, setOpen] = useState(form.open);
  const [notify, setNotify] = useState(form.notify.join('\n'));
  const [senderName, setSenderName] = useState(keyOf(form.contact?.name));
  const [senderEmail, setSenderEmail] = useState(keyOf(form.contact?.email));
  const [senderPhone, setSenderPhone] = useState(keyOf(form.contact?.phone));
  const [success, setSuccess] = useState(form.success ? localized(form.success, locale) : '');
  const [submitLabel, setSubmitLabel] = useState(form.submitLabel ? localized(form.submitLabel, locale) : '');
  const [days, setDays] = useState<number | null>(form.retentionDays ?? null);
  const [startsDeal, setStartsDeal] = useState(form.startsDeal === true);
  // Which of the form's fields fills each of the site's own fields for contacts, by the custom field's id.
  const custom = liveFields(useCustomFields().data?.contact ?? []);
  const [fills, setFills] = useState<Readonly<Record<string, string>>>(() => Object.fromEntries(Object.entries(form.fills ?? {}).map(([fieldId, customId]) => [customId, keyOf(fieldId)])));
  const [problems, setProblems] = useState(NO_PROBLEMS);

  // Each mark is offered the fields of the kind that can hold it.
  const choices = (type: string) => [{ id: NONE, label: messages.forms.noField }, ...fields.filter((field) => field.type === type).map((field) => ({ id: field.key, label: localized(field.label, locale) }))];
  const words = (text: string, was: FormDef['success']) => (text.trim() === '' ? null : { ...was, [language]: text.trim() });

  const send = () => {
    if (name.trim() === '') return setProblems({ label: messages.forms.nameNeeded });
    setProblems(NO_PROBLEMS);
    update.mutate(
      {
        id: form.id,
        changes: {
          label: { ...form.label, [language]: name.trim() },
          open: isOpen,
          notify: notify.split(/[\n,;]+/),
          contact: {
            ...(senderName !== NONE && { name: senderName }),
            ...(senderEmail !== NONE && { email: senderEmail }),
            ...(senderPhone !== NONE && { phone: senderPhone }),
          },
          success: words(success, form.success),
          submitLabel: words(submitLabel, form.submitLabel),
          retentionDays: days,
          fills: Object.fromEntries(Object.entries(fills).flatMap(([customId, key]) => (key === NONE ? [] : [[key, customId]]))),
          startsDeal,
          expectedRevision: form.revision,
        },
      },
      {
        onSuccess: () => {
          toast({ title: messages.forms.saved, tone: 'success' });
          close();
        },
        onError: (error) => {
          // What the server said about a setting goes on that setting.
          const about = error instanceof AdminRequestError ? String(error.issues[0]?.path[0] ?? '') : '';
          if (about !== '') setProblems({ [about]: messageOf(error) });
          toast({ title: messages.forms.notSaved, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  const title = messages.forms.settingsTitle(localized(form.label, locale));
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
          <Button isPending={update.isPending} onPress={send}>
            {messages.forms.save}
          </Button>
        </>
      }
    >
      <Form label={title} gap={4} onSubmit={send}>
        <TextField label={messages.forms.formName} value={name} onChange={setName} isRequired autoComplete="off" {...(problems['label'] !== undefined && { errorMessage: problems['label'] })} />
        <Switch label={messages.forms.isOpen} isSelected={isOpen} onChange={setOpen} />
        <Text size="sm" tone="muted">
          {messages.forms.isOpenHelp}
        </Text>
        <TextArea label={messages.forms.notify} description={messages.forms.notifyHelp} value={notify} onChange={setNotify} rows={3} {...(problems['notify'] !== undefined && { errorMessage: problems['notify'] })} />
        <Select label={messages.forms.senderEmail} description={messages.forms.senderHelp} options={choices('email')} value={senderEmail} onChange={setSenderEmail} />
        <Select label={messages.forms.senderName} options={choices('text')} value={senderName} onChange={setSenderName} />
        <Select label={messages.forms.senderPhone} options={choices('phone')} value={senderPhone} onChange={setSenderPhone} />
        {custom.map((field, index) => (
          <Select
            key={field.id}
            label={messages.forms.fills(localized(field.label, locale))}
            {...(index === 0 && { description: messages.forms.fillsHelp })}
            options={choices(field.type)}
            value={fills[field.id] ?? NONE}
            onChange={(key) => setFills({ ...fills, [field.id]: key })}
          />
        ))}
        <Switch label={messages.forms.startsDeal} isSelected={startsDeal} onChange={setStartsDeal} />
        <Text size="sm" tone="muted">
          {messages.forms.startsDealHelp}
        </Text>
        <TextField label={messages.forms.success} description={messages.forms.successHelp} value={success} onChange={setSuccess} autoComplete="off" />
        <TextField label={messages.forms.submitLabel} description={messages.forms.submitLabelHelp} value={submitLabel} onChange={setSubmitLabel} autoComplete="off" />
        <NumberField
          label={messages.forms.retention}
          description={messages.forms.retentionHelp}
          value={days}
          onChange={setDays}
          minValue={1}
          isInteger
          {...(problems['retentionDays'] !== undefined && { errorMessage: problems['retentionDays'] })}
        />
      </Form>
    </Dialog>
  );
}
