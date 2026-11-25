import { EMAIL_PROVIDERS, type EmailProvider, type EmailSettings } from '@velocity-astro/cms-core';
import { Button, Card, ConfirmDialog, Form, Inline, Link, Select, Stack, Tag, Text, TextField, toast } from '@velocity-astro/cms-ui';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { AdminRequestError } from '../../client/errors.js';
import { useEmailSettings, useSaveEmailSettings, useSendTestEmail, useSession } from '../../client/queries.js';
import { isConflict, useDraft } from '../../lib/use-draft.js';
import { useMessages } from '../../messages/messages-context.js';

const NO_PROBLEMS: Readonly<Record<string, string>> = {};

/** A sender kept as `Name <address>`, in its two parts. */
const NAMED = /^\s*"?([^<>"]*?)"?\s*<([^<>]+)>\s*$/;
const partsOf = (from: string): { name: string; address: string } => {
  const named = NAMED.exec(from);
  return named ? { name: named[1]?.trim() ?? '', address: named[2]?.trim() ?? '' } : { name: '', address: from.trim() };
};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** How the site's email is sent: the service, its key and the sender, with a test to see that it works. */
export function EmailSettingsPanel() {
  const settings = useEmailSettings();
  if (settings.isPending) return <LoadingState shape="form" />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  return (
    <EmailCard settings={settings.data} />
  );
}

function EmailCard({ settings }: { readonly settings: EmailSettings }) {
  const messages = useMessages();
  const words = messages.settings.email;
  const session = useSession();
  const save = useSaveEmailSettings();
  const test = useSendTestEmail();
  const kept = partsOf(settings.from);
  const keptName = settings.senderName !== '' ? settings.senderName : kept.name;
  // Only what is typed here is held, so what another owner saved meanwhile is shown and never saved over unseen.
  const draft = useDraft<{ provider: EmailProvider; from: string; senderName: string }>({ provider: settings.provider, from: kept.address, senderName: keptName });
  const { provider, from, senderName } = draft.values;
  const setProvider = (next: EmailProvider) => draft.set('provider', next);
  const setFrom = (next: string) => draft.set('from', next);
  const setSenderName = (next: string) => draft.set('senderName', next);
  const [key, setKey] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [problems, setProblems] = useState(NO_PROBLEMS);

  const typesKey = !settings.hasKey || replacing;
  const changed = from.trim() !== kept.address || senderName.trim() !== keptName || provider !== settings.provider || (typesKey && key.trim() !== '');
  const address = session.data?.email ?? '';

  const send = () => {
    setProblems(NO_PROBLEMS);
    save.mutate(
      { provider, from, senderName, ...(typesKey && key.trim() !== '' && { apiKey: key }), expectedRevision: settings.revision },
      {
        onSuccess: (saved) => {
          // What was typed is not kept on the screen once it is saved.
          setKey('');
          setReplacing(false);
          draft.settle();
          toast({ title: words.saved, ...(saved.sending && !settings.sending && { description: words.savedDescription }), tone: 'success' });
        },
        onError: (error) => {
          const issues = error instanceof AdminRequestError ? error.issues : [];
          setProblems(Object.fromEntries(issues.map((issue) => [String(issue.path[0] ?? 'from'), issue.message])));
          toast({ title: words.notSaved, description: isConflict(error) ? messages.app.savedElsewhere : messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  const sendTest = () =>
    test.mutate(undefined, {
      onSuccess: () => toast({ title: words.testSent, description: words.testSentDescription(address), tone: 'success' }),
      onError: (error) => toast({ title: words.testNotSent, description: messageOf(error), tone: 'danger' }),
    });

  const stop = () =>
    save.mutate(
      { from: settings.from, apiKey: null, expectedRevision: settings.revision },
      {
        onSuccess: () => {
          setKey('');
          setReplacing(false);
          toast({ title: words.stopped, description: words.stoppedDescription, tone: 'success' });
        },
        onError: (error) => toast({ title: words.notSaved, description: isConflict(error) ? messages.app.savedElsewhere : messageOf(error), tone: 'danger' }),
        onSettled: () => setStopping(false),
      },
    );

  const testButton = (
    <Button variant="secondary" icon={Send} isPending={test.isPending} isDisabled={!settings.canTest || changed} onPress={sendTest}>
      {words.test}
    </Button>
  );
  const state =
    settings.fixedBy !== undefined ? <Tag tone="info">{words.states[settings.fixedBy]}</Tag> : settings.sending ? <Tag tone="success">{words.states.sending}</Tag> : <Tag tone="warning">{words.states.off}</Tag>;

  const saveName = () => {
    setProblems(NO_PROBLEMS);
    save.mutate(
      { senderName, expectedRevision: settings.revision },
      {
        onSuccess: () => {
          draft.settle();
          toast({ title: words.saved, tone: 'success' });
        },
        onError: (error) => {
          const issues = error instanceof AdminRequestError ? error.issues : [];
          setProblems(Object.fromEntries(issues.map((issue) => [String(issue.path[0] ?? 'senderName'), issue.message])));
          toast({ title: words.notSaved, description: isConflict(error) ? messages.app.savedElsewhere : messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  const nameField = (
    <TextField
      label={words.senderName}
      value={senderName}
      onChange={setSenderName}
      autoComplete="off"
      description={words.senderNameHelp}
      {...(problems['senderName'] !== undefined && { errorMessage: problems['senderName'] })}
    />
  );

  if (settings.fixedBy !== undefined) {
    return (
      <Card title={words.title} description={words.description} actions={state}>
        <Stack gap={4}>
          <Text>{words.fixed[settings.fixedBy]}</Text>
          {settings.fixedBy === 'server' &&
            (settings.senderNameFixedBy === undefined ? (
              <Form onSubmit={saveName}>
                {nameField}
                <Inline gap={3}>
                  <Button type="submit" variant="secondary" isPending={save.isPending} isDisabled={senderName.trim() === settings.senderName}>
                    {words.saveSenderName}
                  </Button>
                </Inline>
              </Form>
            ) : (
              <Text tone="secondary">{words.senderNameFixed}</Text>
            ))}
          <Text size="sm" tone="muted">
            {words.look}
          </Text>
          {settings.canTest && (
            <Stack gap={2}>
              <Inline gap={3}>{testButton}</Inline>
              <Text size="sm" tone="muted">
                {words.testHelp(address)}
              </Text>
            </Stack>
          )}
        </Stack>
      </Card>
    );
  }

  return (
    <Card title={words.title} description={words.description} actions={state}>
      <Form onSubmit={send}>
        {!settings.sending && <Text tone="secondary">{words.offHelp}</Text>}
        <Select
          label={words.provider}
          options={EMAIL_PROVIDERS.map((id) => ({ id, label: words.providers[id] }))}
          value={provider}
          onChange={(id) => setProvider(id as EmailProvider)}
          description={words.providerHelp}
          {...(problems['provider'] !== undefined && { errorMessage: problems['provider'] })}
        />
        <Link href={words.providerLinks[provider]} opensInNewTab>
          {words.providerLink(words.providers[provider])}
        </Link>
        {typesKey ? (
          <Stack gap={2}>
            <TextField
              label={words.key}
              type="password"
              autoComplete="off"
              value={key}
              onChange={setKey}
              description={words.keyHelp}
              {...(problems['apiKey'] !== undefined && { errorMessage: problems['apiKey'] })}
            />
            {settings.hasKey && (
              <Inline gap={3}>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setKey('');
                    setReplacing(false);
                  }}
                >
                  {words.keyKeep}
                </Button>
              </Inline>
            )}
          </Stack>
        ) : (
          <Stack gap={2}>
            <Text weight="semibold">{words.key}</Text>
            <Text tone="secondary">{words.keySaved}</Text>
            <Inline gap={3}>
              <Button variant="secondary" size="sm" onPress={() => setReplacing(true)}>
                {words.keyReplace}
              </Button>
            </Inline>
          </Stack>
        )}
        {nameField}
        <TextField
          label={words.from}
          value={from}
          onChange={setFrom}
          autoComplete="off"
          description={words.fromHelp}
          {...(problems['from'] !== undefined && { errorMessage: problems['from'] })}
        />
        <Stack gap={2}>
          <Inline gap={3}>
            <Button type="submit" isPending={save.isPending && !stopping} isDisabled={!changed}>
              {words.save}
            </Button>
            {testButton}
            {settings.hasKey && (
              <Button variant="ghost" onPress={() => setStopping(true)}>
                {words.stop}
              </Button>
            )}
          </Inline>
          <Text size="sm" tone="muted">
            {settings.canTest && changed ? words.testAfterSave : words.testHelp(address)}
          </Text>
        </Stack>
        <Text size="sm" tone="muted">
          {words.look}
        </Text>
      </Form>
      <ConfirmDialog
        isOpen={stopping}
        onOpenChange={(isOpen) => !isOpen && setStopping(false)}
        title={words.stopTitle}
        confirmLabel={words.stopConfirm}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={save.isPending}
        onConfirm={stop}
      >
        {words.stopDescription}
      </ConfirmDialog>
    </Card>
  );
}
