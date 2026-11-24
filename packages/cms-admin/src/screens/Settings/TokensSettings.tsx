import { TOKEN_ROLES, type Role } from '@velocity-astro/cms-core';
import { Button, Card, Checkbox, ConfirmDialog, Dialog, EmptyState, Form, IconButton, Inline, NumberField, Select, Stack, Table, Tag, Text, TextField, toast, type TableColumn, type TableRow } from '@velocity-astro/cms-ui';
import { KeyRound, Plug, Plus, Trash2, Unplug } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import type { AccessToken, ConnectedApp, MadeAccessToken } from '../../client/admin-client.js';
import { AdminRequestError } from '../../client/errors.js';
import { useConnections, useCreateToken, useDisconnect, useRevokeToken, useTokens } from '../../client/queries.js';
import { relativeTime } from '../../lib/relative-time.js';
import { siteAddress } from '../../lib/site-address.js';
import { useClosing, useLast } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

const NO_PROBLEMS: Readonly<Record<string, string>> = {};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Access tokens: what lets an AI agent or a script work with the site's content without a
 * browser. An owner makes one with a role, says whether it may publish and read personal data,
 * and sees the token once. Taking one away refuses it from its next request.
 */
export function TokensPanel() {
  const words = useMessages().settings.tokens;
  const messages = useMessages();
  const locale = useLocale();
  const tokens = useTokens();
  const revoke = useRevokeToken();
  const [isMaking, setMaking] = useState(false);
  const [made, setMade] = useState<MadeAccessToken | null>(null);
  const [leaving, setLeaving] = useState<AccessToken | null>(null);
  const asked = useLast(leaving);

  if (tokens.isPending) return <LoadingState shape="table" />;
  if (tokens.isError) return <ErrorState error={tokens.error} onRetry={() => void tokens.refetch()} />;

  const columns: TableColumn[] = [
    { id: 'name', label: words.columnName },
    { id: 'may', label: words.columnMay, isSecondary: true },
    { id: 'ends', label: words.columnEnds, isSecondary: true },
    { id: 'actions', label: words.columnActions, align: 'end' },
  ];
  const rows: TableRow[] = tokens.data.map((token) => ({
    id: token.id,
    cells: {
      name: (
        <Stack gap={0}>
          <Text weight="semibold">{token.name}</Text>
          <Text size="sm" tone="muted">
            {[words.hint(token.hint), token.madeBy === null ? words.madeOnServer : words.madeBy(token.madeBy), token.lastUsedAt === null ? words.neverUsed : words.lastUsed(relativeTime(token.lastUsedAt, locale))].join(' · ')}
          </Text>
        </Stack>
      ),
      may: (
        <Inline gap={1}>
          <Tag>{words.roles[token.role]}</Tag>
          <Tag tone={token.publish ? 'warning' : 'neutral'}>{token.publish ? words.publishes : words.drafts}</Tag>
          {token.personalData && <Tag tone="warning">{words.personal}</Tag>}
        </Inline>
      ),
      ends: <Text size="sm">{relativeTime(token.expiresAt, locale)}</Text>,
      actions: <IconButton label={words.revoke(token.name)} icon={Trash2} onPress={() => setLeaving(token)} />,
    },
  }));
  const makeButton = (
    <Button icon={Plus} onPress={() => setMaking(true)}>
      {words.make}
    </Button>
  );

  return (
    <Stack gap={6}>
      <ConnectedAppsCard />
      <Card title={words.title} description={words.description} actions={tokens.data.length > 0 ? makeButton : undefined} isFlush={tokens.data.length > 0}>
        {tokens.data.length === 0 ? <EmptyState icon={KeyRound} title={words.empty} description={words.emptyDescription} action={makeButton} level={3} /> : <Table label={words.title} columns={columns} rows={rows} frame="none" />}
      </Card>
      {/* Made anew each time it opens, so it never shows the last token's details. */}
      {isMaking && (
        <MakeTokenDialog
          onClose={() => setMaking(false)}
          onMade={(token) => {
            setMaking(false);
            setMade(token);
          }}
        />
      )}
      {made && <ShownTokenDialog made={made} onClose={() => setMade(null)} />}
      <ConfirmDialog
        isOpen={leaving !== null}
        onOpenChange={(isOpen) => !isOpen && setLeaving(null)}
        title={words.revokeTitle(asked?.name ?? '')}
        confirmLabel={words.revokeConfirm}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={revoke.isPending}
        onConfirm={() => {
          if (!leaving) return;
          revoke.mutate(leaving.id, {
            onSuccess: () => toast({ title: words.revoked(leaving.name), tone: 'success' }),
            onError: (error) => toast({ title: words.notRevoked, description: messageOf(error), tone: 'danger' }),
            onSettled: () => setLeaving(null),
          });
        }}
      >
        {words.revokeDescription}
      </ConfirmDialog>
    </Stack>
  );
}

/**
 * The apps that connected by themselves: someone gave the app the site's MCP address, signed in
 * and pressed Allow. The address is here to copy, and each app can be disconnected.
 */
function ConnectedAppsCard() {
  const messages = useMessages();
  const tokens = messages.settings.tokens;
  const words = tokens.connect;
  const locale = useLocale();
  const connections = useConnections();
  const disconnect = useDisconnect();
  const [leaving, setLeaving] = useState<ConnectedApp | null>(null);
  const asked = useLast(leaving);

  if (connections.isPending) return <LoadingState shape="table" />;
  if (connections.isError) return <ErrorState error={connections.error} onRetry={() => void connections.refetch()} />;

  const columns: TableColumn[] = [
    { id: 'name', label: words.columnName },
    { id: 'may', label: tokens.columnMay, isSecondary: true },
    { id: 'actions', label: tokens.columnActions, align: 'end' },
  ];
  const rows: TableRow[] = connections.data.map((app) => ({
    id: app.id,
    cells: {
      name: (
        <Stack gap={0}>
          <Text weight="semibold">{app.name}</Text>
          <Text size="sm" tone="muted">
            {[...(app.returnsTo === '' ? [] : [words.from(app.returnsTo)]), words.connectedBy(app.connectedBy), app.lastUsedAt === null ? tokens.neverUsed : tokens.lastUsed(relativeTime(app.lastUsedAt, locale))].join(' · ')}
          </Text>
        </Stack>
      ),
      may: (
        <Inline gap={1}>
          <Tag>{tokens.roles[app.role]}</Tag>
          <Tag tone={app.publish ? 'warning' : 'neutral'}>{app.publish ? tokens.publishes : tokens.drafts}</Tag>
          {app.personalData && <Tag tone="warning">{tokens.personal}</Tag>}
        </Inline>
      ),
      actions: <IconButton label={words.disconnect(app.name)} icon={Unplug} onPress={() => setLeaving(app)} />,
    },
  }));

  return (
    <>
      <Card title={words.title} description={words.description}>
        <Stack gap={4}>
          <TextField label={tokens.mcpField} value={tokens.mcpAddress(siteAddress())} isReadOnly autoComplete="off" description={words.addressHelp} />
          {connections.data.length === 0 ? <EmptyState icon={Plug} title={words.empty} level={3} /> : <Table label={words.title} columns={columns} rows={rows} />}
        </Stack>
      </Card>
      <ConfirmDialog
        isOpen={leaving !== null}
        onOpenChange={(isOpen) => !isOpen && setLeaving(null)}
        title={words.disconnectTitle(asked?.name ?? '')}
        confirmLabel={words.disconnectConfirm}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={disconnect.isPending}
        onConfirm={() => {
          if (!leaving) return;
          disconnect.mutate(leaving.id, {
            onSuccess: () => toast({ title: words.disconnected(leaving.name), tone: 'success' }),
            onError: (error) => toast({ title: words.notDisconnected, description: messageOf(error), tone: 'danger' }),
            onSettled: () => setLeaving(null),
          });
        }}
      >
        {words.disconnectDescription}
      </ConfirmDialog>
    </>
  );
}

/** The window an owner fills in to make a token. */
function MakeTokenDialog({ onClose, onMade }: { readonly onClose: () => void; readonly onMade: (made: MadeAccessToken) => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const words = messages.settings.tokens;
  const create = useCreateToken();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [publish, setPublish] = useState(false);
  const [personalData, setPersonalData] = useState(false);
  const [days, setDays] = useState<number | null>(90);
  const [problems, setProblems] = useState(NO_PROBLEMS);

  const send = () => {
    setProblems(NO_PROBLEMS);
    create.mutate(
      { name, role, publish, personalData, days: days ?? 0 },
      {
        onSuccess: (made) => {
          toast({ title: words.made, tone: 'success' });
          onMade(made);
        },
        onError: (error) => {
          const issues = error instanceof AdminRequestError ? error.issues : [];
          setProblems(issues.length > 0 ? Object.fromEntries(issues.map((issue) => [issue.path[0] ?? 'name', issue.message])) : { name: messageOf(error) });
          if (issues.length === 0) toast({ title: words.notMade, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  return (
    <Dialog
      {...dialog}
      title={words.makeTitle}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={create.isPending} onPress={send}>
            {words.makeSend}
          </Button>
        </>
      }
    >
      <Form label={words.makeTitle} gap={4} onSubmit={send}>
        <TextField label={words.name} value={name} onChange={setName} isRequired autoFocus autoComplete="off" description={words.nameHelp} {...(problems['name'] !== undefined && { errorMessage: problems['name'] })} />
        <Select
          label={words.role}
          options={TOKEN_ROLES.map((id) => ({ id, label: words.roles[id] }))}
          value={role}
          onChange={(id) => setRole(id as Role)}
          description={words.roleMeans[role]}
          {...(problems['role'] !== undefined && { errorMessage: problems['role'] })}
        />
        <Stack gap={1}>
          <Checkbox label={words.publish} isSelected={publish} onChange={setPublish} />
          <Text size="sm" tone="muted">
            {words.publishHelp}
          </Text>
        </Stack>
        <Stack gap={1}>
          <Checkbox label={words.personalData} isSelected={personalData} onChange={setPersonalData} />
          <Text size="sm" tone="muted">
            {words.personalDataHelp}
          </Text>
        </Stack>
        <NumberField label={words.days} value={days} onChange={setDays} minValue={1} maxValue={365} isInteger description={words.daysHelp} {...(problems['days'] !== undefined && { errorMessage: problems['days'] })} />
      </Form>
    </Dialog>
  );
}

/** The token, shown this once, with how to connect an agent to it. */
function ShownTokenDialog({ made, onClose }: { readonly made: MadeAccessToken; readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const words = messages.settings.tokens;
  return (
    <Dialog
      {...dialog}
      title={words.shownTitle}
      closeLabel={messages.app.dismiss}
      footer={<Button onPress={close}>{words.done}</Button>}
    >
      <Stack gap={4}>
        <Text>{words.shownDescription}</Text>
        <TextField label={words.shownField} value={made.secret} isReadOnly autoComplete="off" />
        <Text size="sm">{words.shownMcp}</Text>
        <TextField label={words.mcpField} value={words.mcpAddress(siteAddress())} isReadOnly autoComplete="off" />
        <Text size="sm" tone="muted">
          {words.shownCommand}
        </Text>
      </Stack>
    </Dialog>
  );
}
