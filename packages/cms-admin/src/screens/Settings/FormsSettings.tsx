import { CHALLENGE_PROVIDERS, MAX_FORM_POSTS_PER_ADDRESS, type ChallengeProvider, type FormsSettings } from '@velocity-astro/cms-core';
import { Button, Card, ConfirmDialog, Form, Inline, NumberField, Segmented, Stack, Tag, Text, TextField, toast } from '@velocity-astro/cms-ui';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { AdminRequestError } from '../../client/errors.js';
import { useFormsSettings, useSaveFormsSettings, useTestFormsSettings } from '../../client/queries.js';
import { isConflict, useDraft } from '../../lib/use-draft.js';
import { useMessages } from '../../messages/messages-context.js';

const NO_PROBLEMS: Readonly<Record<string, string>> = {};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const problemsOf = (error: unknown): Readonly<Record<string, string>> =>
  Object.fromEntries((error instanceof AdminRequestError ? error.issues : []).map((issue) => [String(issue.path[0] ?? 'siteKey'), issue.message]));

/** How the site's forms are guarded: a check that the sender is a person, and how much one address may send. */
export function FormsSettingsPanel() {
  const settings = useFormsSettings();
  if (settings.isPending) return <LoadingState shape="form" />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  return (
    <>
      <Stack gap={6}>
        <ChallengeCard settings={settings.data} />
        <LimitCard settings={settings.data} />
      </Stack>
    </>
  );
}

function ChallengeCard({ settings }: { readonly settings: FormsSettings }) {
  const messages = useMessages();
  const words = messages.settings.forms;
  const save = useSaveFormsSettings();
  const test = useTestFormsSettings();
  // Only what is typed here is held, so what another owner saved meanwhile is shown and never saved over unseen.
  const draft = useDraft<{ provider: ChallengeProvider; siteKey: string }>({ provider: settings.provider, siteKey: settings.siteKey });
  const { provider, siteKey } = draft.values;
  const setProvider = (next: ChallengeProvider) => draft.set('provider', next);
  const setSiteKey = (next: string) => draft.set('siteKey', next);
  const [secret, setSecret] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [problems, setProblems] = useState(NO_PROBLEMS);

  // A secret key saved for one service is of no use to another: a new service asks for its own.
  const isSwitching = provider !== settings.provider;
  const typesSecret = !settings.hasSecret || replacing || isSwitching;
  const changed = isSwitching || siteKey.trim() !== settings.siteKey || (typesSecret && secret.trim() !== '');
  const problemOf = (field: string) => (problems[field] !== undefined ? { errorMessage: problems[field] } : {});

  const send = () => {
    setProblems(NO_PROBLEMS);
    save.mutate(
      { provider, siteKey, ...(typesSecret && secret.trim() !== '' && { secretKey: secret }), postsPerAddress: settings.postsPerAddress, expectedRevision: settings.revision },
      {
        onSuccess: (saved) => {
          // What was typed is not kept on the screen once it is saved.
          setSecret('');
          setReplacing(false);
          draft.settle();
          toast({ title: words.saved, ...(saved.checking && { description: words.savedDescription[saved.provider] }), tone: 'success' });
        },
        onError: (error) => {
          setProblems(problemsOf(error));
          toast({ title: words.notSaved, description: isConflict(error) ? messages.app.savedElsewhere : messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  const check = () =>
    test.mutate(undefined, {
      onSuccess: () => toast({ title: words.testWorked[settings.provider], description: words.testWorkedDescription, tone: 'success' }),
      onError: (error) => toast({ title: words.testFailed, description: messageOf(error), tone: 'danger' }),
    });

  const stop = () =>
    save.mutate(
      { siteKey: '', secretKey: null, postsPerAddress: settings.postsPerAddress, expectedRevision: settings.revision },
      {
        onSuccess: () => {
          draft.settle();
          setSecret('');
          setReplacing(false);
          toast({ title: words.stopped, description: words.stoppedDescription, tone: 'success' });
        },
        onError: (error) => toast({ title: words.notSaved, description: isConflict(error) ? messages.app.savedElsewhere : messageOf(error), tone: 'danger' }),
        onSettled: () => setStopping(false),
      },
    );

  return (
    <Card title={words.title} description={words.description} actions={<Tag tone={settings.checking ? 'success' : 'neutral'}>{settings.checking ? words.states.checking : words.states.off}</Tag>}>
      <Form onSubmit={send}>
        <Segmented
          label={words.provider}
          isLabelShown
          options={CHALLENGE_PROVIDERS.map((id) => ({ id, label: words.providers[id] }))}
          selected={provider}
          onChange={(id) => setProvider(CHALLENGE_PROVIDERS.find((one) => one === id) ?? provider)}
          description={words.providerHelp}
          {...problemOf('provider')}
        />
        <Text tone="secondary">{settings.checking && !isSwitching ? words.help.checking[provider] : words.help.off[provider]}</Text>
        <TextField label={words.siteKey} autoComplete="off" value={siteKey} onChange={setSiteKey} description={words.siteKeyHelp} {...problemOf('siteKey')} />
        {typesSecret ? (
          <Stack gap={2}>
            <TextField label={words.secret} type="password" autoComplete="off" value={secret} onChange={setSecret} description={words.secretHelp} {...problemOf('secretKey')} />
            {settings.hasSecret && !isSwitching && (
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
            <Button variant="secondary" icon={ShieldCheck} isPending={test.isPending} isDisabled={!settings.checking || changed} onPress={check}>
              {words.test}
            </Button>
            {settings.hasSecret && (
              <Button variant="ghost" onPress={() => setStopping(true)}>
                {words.stop}
              </Button>
            )}
          </Inline>
          <Text size="sm" tone="muted">
            {settings.checking && changed ? words.testAfterSave : words.testHelp[provider]}
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

function LimitCard({ settings }: { readonly settings: FormsSettings }) {
  const messages = useMessages();
  const words = messages.settings.forms;
  const save = useSaveFormsSettings();
  const draft = useDraft<{ limit: number | null }>({ limit: settings.postsPerAddress });
  const limit = draft.values.limit;
  const setLimit = (next: number | null) => draft.set('limit', next);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  const send = () => {
    setProblem(undefined);
    // The keys stay as they are: the site key is sent as it is saved, and the secret key is left out.
    save.mutate(
      { siteKey: settings.siteKey, postsPerAddress: limit ?? 0, expectedRevision: settings.revision },
      {
        onSuccess: (saved) => {
          draft.settle();
          toast({ title: words.limitSaved, description: words.limitSavedDescription(saved.postsPerAddress), tone: 'success' });
        },
        onError: (error) => {
          setProblem(problemsOf(error)['postsPerAddress']);
          toast({ title: words.limitNotSaved, description: isConflict(error) ? messages.app.savedElsewhere : messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  return (
    <Card title={words.limitTitle} description={words.limitDescription}>
      <Form onSubmit={send}>
        <NumberField
          label={words.limit}
          value={limit}
          onChange={setLimit}
          isInteger
          minValue={1}
          maxValue={MAX_FORM_POSTS_PER_ADDRESS}
          description={words.limitHelp(MAX_FORM_POSTS_PER_ADDRESS)}
          {...(problem !== undefined && { errorMessage: problem })}
        />
        <Inline gap={3}>
          <Button type="submit" isPending={save.isPending} isDisabled={limit === settings.postsPerAddress}>
            {words.limitSave}
          </Button>
        </Inline>
      </Form>
    </Card>
  );
}
