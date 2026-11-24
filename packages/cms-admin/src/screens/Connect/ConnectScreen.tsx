import { TOKEN_ROLES, type Role } from '@velocity-astro/cms-core';
import { AuthShell, Button, Checkbox, Form, Inline, LoadingMark, Logo, Select, Spinner, Stack, Text } from '@velocity-astro/cms-ui';
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { paths } from '../../app/paths.js';
import { useGo } from '../../app/use-go.js';
import { useAnswerConnection, useAskedConnection, useSession } from '../../client/queries.js';
import { holdBoot } from '../../lib/boot.js';
import { leave } from '../../lib/leave.js';
import { useMessages } from '../../messages/messages-context.js';

export interface ConnectScreenProps {
  readonly siteName: string;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The one question an app that connects by itself leads to: someone gave Claude or ChatGPT this
 * site's MCP address, and was sent here to say whether it may work with the site and what it
 * may do. Whoever is not signed in signs in first and lands here again. The answer goes to the
 * server, which says where the browser goes next: back to the app.
 */
export function ConnectScreen({ siteName }: ConnectScreenProps) {
  const messages = useMessages();
  const words = messages.connect;
  const tokens = messages.settings.tokens;
  const go = useGo();
  const location = useLocation();
  const query = location.search.replace(/^\?/, '');
  const session = useSession();
  const isSignedIn = session.data !== null && session.data !== undefined;
  const asked = useAskedConnection(query, isSignedIn);
  const answer = useAnswerConnection(query);
  const [role, setRole] = useState<Role>('editor');
  const [publish, setPublish] = useState(false);
  const [personalData, setPersonalData] = useState(false);
  // Which button was pressed, so only that one shows it is working.
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => (session.isPending ? holdBoot() : undefined), [session.isPending]);

  if (session.isPending) return <LoadingMark label={messages.app.opening} />;
  if (session.data === null) return <Navigate to={paths.signInThen(`${paths.connect}${location.search}`)} replace />;

  const brand = (
    <Inline gap={2} align="center">
      <Logo label={messages.app.product} />
      <Text weight="semibold">{siteName}</Text>
    </Inline>
  );
  const toEditor = (
    <Button variant="secondary" fullWidth onPress={() => go(paths.home)}>
      {words.toEditor}
    </Button>
  );

  if (session.isError || asked.isError) {
    return (
      <AuthShell brand={brand} title={words.problemTitle} description={messageOf(session.error ?? asked.error)}>
        {toEditor}
      </AuthShell>
    );
  }
  if (asked.data === undefined) {
    return (
      <AuthShell brand={brand} title={words.readingTitle}>
        <Inline justify="center">
          <Spinner label={messages.app.loading} />
        </Inline>
      </AuthShell>
    );
  }
  // Answered: the browser is on its way back to the app, and the buttons must not be pressed twice.
  const isLeaving = answer.isSuccess;
  const send = (allow: boolean) => {
    setAllowed(allow);
    answer.mutate(allow ? { allow: true, role, publish, personalData } : { allow: false }, { onSuccess: ({ redirect }) => leave.to(redirect) });
  };
  const { appName, returnsTo, isLocal } = asked.data;

  return (
    <AuthShell
      brand={brand}
      title={words.title(appName, siteName)}
      description={words.description(appName)}
      footer={
        <Text size="sm" tone="muted">
          {isLocal ? words.returnsToComputer(appName) : words.returnsTo(returnsTo)} {words.takeAway}
        </Text>
      }
    >
      <Form label={words.title(appName, siteName)} gap={4} onSubmit={() => send(true)}>
        <Select label={tokens.role} options={TOKEN_ROLES.map((id) => ({ id, label: tokens.roles[id] }))} value={role} onChange={(id) => setRole(id as Role)} description={tokens.roleMeans[role]} />
        <Stack gap={1}>
          <Checkbox label={tokens.publish} isSelected={publish} onChange={setPublish} />
          <Text size="sm" tone="muted">
            {tokens.publishHelp}
          </Text>
        </Stack>
        <Stack gap={1}>
          <Checkbox label={tokens.personalData} isSelected={personalData} onChange={setPersonalData} />
          <Text size="sm" tone="muted">
            {tokens.personalDataHelp}
          </Text>
        </Stack>
        {answer.isError && (
          <Text tone="danger" size="sm">
            {messageOf(answer.error)}
          </Text>
        )}
        <Stack gap={2}>
          <Button type="submit" variant="brand" fullWidth isPending={(answer.isPending || isLeaving) && allowed === true} isDisabled={(answer.isPending || isLeaving) && allowed !== true}>
            {words.allow}
          </Button>
          <Button variant="secondary" fullWidth isPending={(answer.isPending || isLeaving) && allowed === false} isDisabled={(answer.isPending || isLeaving) && allowed !== false} onPress={() => send(false)}>
            {words.deny}
          </Button>
        </Stack>
      </Form>
    </AuthShell>
  );
}
