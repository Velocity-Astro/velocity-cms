import type { EntryData, PluginInfo } from '@velocity/cms-core';
import { Button, Dialog, Form, Text, toast } from '@velocity/cms-ui';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { AdminRequestError } from '../../client/errors.js';
import { usePluginSettings, useSavePluginSettings } from '../../client/queries.js';
import { FieldEditor } from '../../fields/FieldEditor.js';
import { localized } from '../../lib/content.js';
import { useClosing } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { PluginSecrets } from './PluginSecrets.js';

const NO_PROBLEMS: ReadonlyMap<string, string> = new Map();

/** A plugin's settings, drawn from the fields the plugin described, with the controls entries use. */
export function PluginSettingsDialog({ plugin, onClose }: { readonly plugin: PluginInfo; readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const locale = useLocale();
  const name = localized(plugin.label, locale);
  const settings = usePluginSettings(plugin.name);
  const save = useSavePluginSettings(plugin.name);
  // What was typed since the window opened. What is saved stays the server's.
  const [typed, setTyped] = useState<EntryData>({});
  const [problems, setProblems] = useState(NO_PROBLEMS);
  const [failure, setFailure] = useState<string | null>(null);
  const values = { ...settings.data?.values, ...typed };

  const send = () => {
    setProblems(NO_PROBLEMS);
    setFailure(null);
    // A setting that was cleared is left out, as an entry's empty field is.
    save.mutate(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)), {
      onSuccess: () => {
        toast({ title: messages.plugins.settingsSaved(name), tone: 'success' });
        close();
      },
      onError: (error) => {
        const issues = error instanceof AdminRequestError ? error.issues : [];
        setProblems(new Map(issues.map((issue) => [issue.path.join('.'), issue.message])));
        // What names no setting is said once, above the form. What was typed stays.
        if (issues.length === 0) setFailure(error instanceof Error ? error.message : String(error));
      },
    });
  };

  return (
    <Dialog
      {...dialog}
      title={messages.plugins.settingsTitle(name)}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={save.isPending} isDisabled={!settings.isSuccess} onPress={send}>
            {messages.plugins.settingsSave}
          </Button>
        </>
      }
    >
      {settings.isPending && <LoadingState shape="form" />}
      {settings.isError && <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />}
      {settings.isSuccess && (
        <Form label={messages.plugins.settingsTitle(name)} gap={4} onSubmit={send}>
          {failure !== null && <Text tone="danger">{`${messages.plugins.settingsNotSaved}. ${failure}`}</Text>}
          {settings.data.fields.map((field) => (
            <FieldEditor key={field.id} field={field} value={values[field.id]} onChange={(value) => setTyped((before) => ({ ...before, [field.id]: value }))} path={field.key} problems={problems} />
          ))}
          {settings.data.secrets.length > 0 && <PluginSecrets plugin={plugin.name} secrets={settings.data.secrets} />}
        </Form>
      )}
    </Dialog>
  );
}
