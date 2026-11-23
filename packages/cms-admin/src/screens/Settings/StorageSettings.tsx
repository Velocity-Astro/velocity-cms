import type { StorageSettings } from '@velocity-astro/cms-core';
import { Button, Card, ConfirmDialog, Form, Inline, Stack, Tag, Text, TextField, toast } from '@velocity-astro/cms-ui';
import { PlugZap } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { AdminRequestError } from '../../client/errors.js';
import { useSaveStorageSettings, useStorageSettings, useTestStorage } from '../../client/queries.js';
import { useMessages } from '../../messages/messages-context.js';

const NO_PROBLEMS: Readonly<Record<string, string>> = {};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Where the site's uploads are kept: a bucket and its keys, with a test to see that it works. */
export function StorageSettingsPanel() {
  const settings = useStorageSettings();
  if (settings.isPending) return <LoadingState shape="form" />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  return (
    <StorageCard settings={settings.data} />
  );
}

function StorageCard({ settings }: { readonly settings: StorageSettings }) {
  const messages = useMessages();
  const words = messages.settings.storage;
  const save = useSaveStorageSettings();
  const test = useTestStorage();
  const [endpoint, setEndpoint] = useState(settings.endpoint);
  const [bucket, setBucket] = useState(settings.bucket);
  const [region, setRegion] = useState(settings.region);
  const [accessKeyId, setAccessKeyId] = useState(settings.accessKeyId);
  const [secret, setSecret] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [problems, setProblems] = useState(NO_PROBLEMS);

  const typesSecret = !settings.hasSecret || replacing;
  const changed =
    endpoint.trim() !== settings.endpoint ||
    bucket.trim() !== settings.bucket ||
    region.trim() !== settings.region ||
    accessKeyId.trim() !== settings.accessKeyId ||
    (typesSecret && secret.trim() !== '');
  const problemOf = (field: string) => (problems[field] !== undefined ? { errorMessage: problems[field] } : {});

  const send = () => {
    setProblems(NO_PROBLEMS);
    save.mutate(
      { endpoint, bucket, region, accessKeyId, ...(typesSecret && secret.trim() !== '' && { secretAccessKey: secret }), expectedRevision: settings.revision },
      {
        onSuccess: (saved) => {
          // What was typed is not kept on the screen once it is saved.
          setSecret('');
          setReplacing(false);
          setEndpoint(saved.endpoint);
          setBucket(saved.bucket);
          setRegion(saved.region);
          setAccessKeyId(saved.accessKeyId);
          toast({ title: words.saved, ...(saved.hasSecret && { description: words.savedDescription }), tone: 'success' });
        },
        onError: (error) => {
          const issues = error instanceof AdminRequestError ? error.issues : [];
          setProblems(Object.fromEntries(issues.map((issue) => [String(issue.path[0] ?? 'endpoint'), issue.message])));
          toast({ title: words.notSaved, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  const tryBucket = () =>
    test.mutate(undefined, {
      onSuccess: () => toast({ title: words.testWorked, description: words.testWorkedDescription, tone: 'success' }),
      onError: (error) => toast({ title: words.testFailed, description: messageOf(error), tone: 'danger' }),
    });

  const stop = () =>
    save.mutate(
      { endpoint: settings.endpoint, bucket: settings.bucket, region: settings.region, accessKeyId: settings.accessKeyId, secretAccessKey: null, expectedRevision: settings.revision },
      {
        onSuccess: () => {
          setSecret('');
          setReplacing(false);
          toast({ title: words.stopped, description: words.stoppedDescription, tone: 'success' });
        },
        onError: (error) => toast({ title: words.notSaved, description: messageOf(error), tone: 'danger' }),
        onSettled: () => setStopping(false),
      },
    );

  const state =
    settings.fixedBy !== undefined ? (
      <Tag tone="info">{words.states[settings.fixedBy]}</Tag>
    ) : (
      <Tag tone={settings.keeping === 'bucket' ? 'success' : settings.keeping === 'folder' ? 'neutral' : 'warning'}>{words.states[settings.keeping]}</Tag>
    );

  if (settings.fixedBy !== undefined) {
    return (
      <Card title={words.title} description={words.description} actions={state}>
        <Text>{words.fixed[settings.fixedBy]}</Text>
      </Card>
    );
  }

  return (
    <Card title={words.title} description={words.description} actions={state}>
      <Form onSubmit={send}>
        <Text tone="secondary">{words.keepingHelp[settings.keeping]}</Text>
        <TextField label={words.endpoint} type="url" autoComplete="off" value={endpoint} onChange={setEndpoint} description={words.endpointHelp} {...problemOf('endpoint')} />
        <TextField label={words.bucket} autoComplete="off" value={bucket} onChange={setBucket} {...problemOf('bucket')} />
        <TextField label={words.region} autoComplete="off" value={region} onChange={setRegion} description={words.regionHelp} {...problemOf('region')} />
        <TextField label={words.accessKeyId} autoComplete="off" value={accessKeyId} onChange={setAccessKeyId} description={words.accessKeyIdHelp} {...problemOf('accessKeyId')} />
        {typesSecret ? (
          <Stack gap={2}>
            <TextField label={words.secret} type="password" autoComplete="off" value={secret} onChange={setSecret} description={words.secretHelp} {...problemOf('secretAccessKey')} />
            {settings.hasSecret && (
              <Inline gap={3}>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setSecret('');
                    setReplacing(false);
                  }}
                >
                  {words.secretKeep}
                </Button>
              </Inline>
            )}
          </Stack>
        ) : (
          <Stack gap={2}>
            <Text weight="semibold">{words.secret}</Text>
            <Text tone="secondary">{words.secretSaved}</Text>
            <Inline gap={3}>
              <Button variant="secondary" size="sm" onPress={() => setReplacing(true)}>
                {words.secretReplace}
              </Button>
            </Inline>
          </Stack>
        )}
        <Stack gap={2}>
          <Inline gap={3}>
            <Button type="submit" isPending={save.isPending && !stopping} isDisabled={!changed}>
              {words.save}
            </Button>
            <Button variant="secondary" icon={PlugZap} isPending={test.isPending} isDisabled={!settings.hasSecret || changed} onPress={tryBucket}>
              {words.test}
            </Button>
            {settings.hasSecret && (
              <Button variant="ghost" onPress={() => setStopping(true)}>
                {words.stop}
              </Button>
            )}
          </Inline>
          <Text size="sm" tone="muted">
            {settings.hasSecret && changed ? words.testAfterSave : words.moveHelp}
          </Text>
        </Stack>
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
