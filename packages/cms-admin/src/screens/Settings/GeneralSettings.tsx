import type { GeneralSettings } from '@velocity-astro/cms-core';
import { Button, Card, Form, Inline, Tag, Text, TextField, toast } from '@velocity-astro/cms-ui';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { AdminRequestError } from '../../client/errors.js';
import { isConflict, useDraft } from '../../lib/use-draft.js';
import { useGeneralSettings, useSaveGeneralSettings } from '../../client/queries.js';
import { useMessages } from '../../messages/messages-context.js';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The site's basics: what it is called. */
export function GeneralSettingsPanel() {
  const settings = useGeneralSettings();
  if (settings.isPending) return <LoadingState shape="form" />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  return (
    <NameCard settings={settings.data} />
  );
}

function NameCard({ settings }: { readonly settings: GeneralSettings }) {
  const messages = useMessages();
  const words = messages.settings.general;
  const save = useSaveGeneralSettings();
  // Only what is typed here is held, so a name someone else saved meanwhile is shown and never saved over unseen.
  const draft = useDraft({ name: settings.siteName });
  const name = draft.values.name;
  const setName = (next: string) => draft.set('name', next);
  const [problem, setProblem] = useState<string | null>(null);

  if (settings.fixedBy !== undefined) {
    return (
      <Card title={words.title} description={words.description} actions={<Tag tone="info">{words.states[settings.fixedBy]}</Tag>}>
        <Text>{words.fixed(settings.defaultSiteName)}</Text>
      </Card>
    );
  }

  const send = () => {
    setProblem(null);
    save.mutate(
      { siteName: name, expectedRevision: settings.revision },
      {
        onSuccess: () => {
          draft.settle();
          toast({ title: words.saved, description: words.savedDescription, tone: 'success' });
        },
        onError: (error) => {
          const issue = error instanceof AdminRequestError ? error.issues.find((candidate) => candidate.path[0] === 'siteName') : undefined;
          setProblem(issue?.message ?? messageOf(error));
          toast({ title: words.notSaved, description: isConflict(error) ? messages.app.savedElsewhere : messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  return (
    <Card title={words.title} description={words.description}>
      <Form onSubmit={send}>
        <TextField
          label={words.name}
          value={name}
          onChange={setName}
          autoComplete="off"
          placeholder={settings.defaultSiteName}
          description={settings.defaultSiteName === '' ? words.nameHelp : words.nameHelpWithDefault(settings.defaultSiteName)}
          {...(problem !== null && { errorMessage: problem })}
        />
        <Inline gap={3}>
          <Button type="submit" isPending={save.isPending} isDisabled={name.trim() === settings.siteName}>
            {words.save}
          </Button>
        </Inline>
      </Form>
    </Card>
  );
}
