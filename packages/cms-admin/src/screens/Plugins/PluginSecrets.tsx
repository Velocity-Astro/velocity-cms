import type { PluginSecretInfo } from '@velocity/cms-core';
import { Button, Fieldset, Inline, Stack, Text, TextField, toast } from '@velocity/cms-ui';
import { useState } from 'react';
import { AdminRequestError } from '../../client/errors.js';
import { useSetPluginSecret } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One key or password: a field to type it in until it is saved, then only the word that it is. */
function PluginSecret({ plugin, secret }: { readonly plugin: string; readonly secret: PluginSecretInfo }) {
  const messages = useMessages();
  const locale = useLocale();
  const label = localized(secret.label, locale);
  const set = useSetPluginSecret(plugin);
  const [typed, setTyped] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const send = (value: string | null) => {
    setProblem(null);
    set.mutate(
      { key: secret.key, value },
      {
        onSuccess: () => {
          // What was typed is not kept on the screen once it is saved.
          setTyped('');
          setReplacing(false);
          toast({ title: value === null ? messages.plugins.secretWasRemoved(label) : messages.plugins.secretWasSaved(label), tone: 'success' });
        },
        onError: (error) => {
          const issue = error instanceof AdminRequestError ? error.issues.find((candidate) => candidate.path.join('.') === secret.key) : undefined;
          setProblem(issue?.message ?? messageOf(error));
          toast({ title: messages.plugins.secretNotSaved(label), description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  if (secret.isSet && !replacing) {
    return (
      <Stack gap={2}>
        <Text weight="semibold">{label}</Text>
        {secret.help !== undefined && (
          <Text size="sm" tone="muted">
            {localized(secret.help, locale)}
          </Text>
        )}
        <Text tone="secondary">{messages.plugins.secretSaved}</Text>
        <Inline gap={3}>
          <Button variant="secondary" size="sm" onPress={() => setReplacing(true)}>
            {messages.plugins.secretReplace(label)}
          </Button>
          <Button variant="ghost" size="sm" isPending={set.isPending} onPress={() => send(null)}>
            {messages.plugins.secretRemove(label)}
          </Button>
        </Inline>
      </Stack>
    );
  }
  return (
    <Stack gap={2}>
      <TextField
        label={label}
        type="password"
        autoComplete="off"
        value={typed}
        onChange={setTyped}
        {...(secret.help !== undefined && { description: localized(secret.help, locale) })}
        {...(problem !== null && { errorMessage: problem })}
      />
      <Inline gap={3}>
        <Button variant="secondary" size="sm" isPending={set.isPending} isDisabled={typed.trim() === ''} onPress={() => send(typed)}>
          {messages.plugins.secretSave(label)}
        </Button>
        {secret.isSet && (
          <Button variant="ghost" size="sm" onPress={() => setReplacing(false)}>
            {messages.plugins.secretKeep}
          </Button>
        )}
      </Inline>
    </Stack>
  );
}

/** The keys and passwords a plugin asks for. Each is saved by itself, and never drawn again once it is. */
export function PluginSecrets({ plugin, secrets }: { readonly plugin: string; readonly secrets: readonly PluginSecretInfo[] }) {
  const messages = useMessages();
  return (
    <Fieldset legend={messages.plugins.secretsTitle} description={messages.plugins.secretsHelp}>
      <Stack gap={4}>
        {secrets.map((secret) => (
          <PluginSecret key={secret.key} plugin={plugin} secret={secret} />
        ))}
      </Stack>
    </Fieldset>
  );
}
