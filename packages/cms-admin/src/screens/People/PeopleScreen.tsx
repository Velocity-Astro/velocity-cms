import { ROLES, type Role } from '@velocity/cms-core';
import { Box, Button, ConfirmDialog, Dialog, Form, IconButton, Inline, PageHeader, Select, Stack, Table, Tag, Text, TextField, toast, type TableColumn, type TableRow } from '@velocity/cms-ui';
import { Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import type { Person } from '../../client/admin-client.js';
import { AdminRequestError } from '../../client/errors.js';
import { useChangePersonRole, useInvitePerson, usePeople, useRemovePerson, useSession } from '../../client/queries.js';
import { useMessages } from '../../messages/messages-context.js';
import { useClosing, useLast } from '../../lib/use-closing.js';

const NO_PROBLEMS: Readonly<Record<string, string>> = {};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Everyone who can sign in: who they are, what they may do, and the way to let someone new in. */
export function PeopleScreen() {
  const messages = useMessages();
  const session = useSession();
  const people = usePeople();
  const changeRole = useChangePersonRole();
  const remove = useRemovePerson();
  const [isInviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState<Person | null>(null);
  const asked = useLast(leaving);

  const roles = ROLES.map((role) => ({ id: role, label: messages.people.roles[role] }));
  const me = session.data?.id;

  const columns: TableColumn[] = [
    { id: 'name', label: messages.people.columnName },
    { id: 'role', label: messages.people.columnRole },
    { id: 'actions', label: messages.people.columnActions, align: 'end' },
  ];
  const rows: TableRow[] = (people.data ?? []).map((person) => ({
    id: person.id,
    cells: {
      name: (
        <Stack gap={0}>
          <Inline gap={2}>
            <Text weight="semibold">{person.name}</Text>
            {person.id === me && <Tag>{messages.people.you}</Tag>}
          </Inline>
          <Text size="sm" tone="muted">
            {person.email}
          </Text>
        </Stack>
      ),
      role: (
        <Select
          label={messages.people.roleOf(person.name)}
          isLabelHidden
          options={roles}
          value={person.role}
          // Changing your own role could lock you out of this very screen.
          isDisabled={person.id === me || changeRole.isPending}
          onChange={(role) =>
            changeRole.mutate(
              { id: person.id, role: role as Role },
              {
                onSuccess: (changed) => toast({ title: messages.people.roleChanged(changed.name, messages.people.roles[changed.role]), tone: 'success' }),
                onError: (error) => toast({ title: messages.people.roleNotChanged, description: messageOf(error), tone: 'danger' }),
              },
            )
          }
        />
      ),
      actions: <IconButton label={messages.people.remove(person.name)} icon={Trash2} isDisabled={person.id === me} onPress={() => setLeaving(person)} />,
    },
  }));

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader
          title={messages.people.title}
          description={messages.people.description}
          actions={
            <Button icon={UserPlus} onPress={() => setInviting(true)}>
              {messages.people.invite}
            </Button>
          }
        />
        {people.isPending && <LoadingState shape="table" />}
        {people.isError && <ErrorState error={people.error} onRetry={() => void people.refetch()} />}
        {people.isSuccess && <Table label={messages.people.title} columns={columns} rows={rows} />}
        <Stack gap={1}>
          {ROLES.map((role) => (
            <Text key={role} size="sm" tone="muted">
              {messages.people.roleMeans[role]}
            </Text>
          ))}
        </Stack>
      </Stack>
      {/* Made anew each time it opens, so it never shows the last person's details. */}
      {isInviting && <InviteDialog onClose={() => setInviting(false)} />}
      <ConfirmDialog
        isOpen={leaving !== null}
        onOpenChange={(isOpen) => !isOpen && setLeaving(null)}
        title={messages.people.removeTitle(asked?.name ?? '')}
        confirmLabel={messages.people.removeConfirm}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() => {
          if (!leaving) return;
          remove.mutate(leaving.id, {
            onSuccess: () => toast({ title: messages.people.removed(leaving.name), tone: 'success' }),
            onError: (error) => toast({ title: messages.people.notRemoved, description: messageOf(error), tone: 'danger' }),
            onSettled: () => setLeaving(null),
          });
        }}
      >
        {messages.people.removeDescription}
      </ConfirmDialog>
    </Box>
  );
}

/** The window an owner fills in to let someone in. */
function InviteDialog({ onClose }: { readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const invite = useInvitePerson();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [problems, setProblems] = useState(NO_PROBLEMS);

  const send = () => {
    setProblems(NO_PROBLEMS);
    invite.mutate(
      { name, email, role },
      {
        onSuccess: (person) => {
          toast({ title: messages.people.invited(person.name), description: messages.people.invitedDescription(person.email), tone: 'success' });
          close();
        },
        onError: (error) => {
          const issues = error instanceof AdminRequestError ? error.issues : [];
          // What the server said about a field goes on that field. Anything else is about the address.
          setProblems(issues.length > 0 ? Object.fromEntries(issues.map((issue) => [issue.path[0] ?? 'email', issue.message])) : { email: messageOf(error) });
        },
      },
    );
  };

  return (
    <Dialog
      {...dialog}
      title={messages.people.inviteTitle}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={invite.isPending} onPress={send}>
            {messages.people.inviteSend}
          </Button>
        </>
      }
    >
      <Form label={messages.people.inviteTitle} gap={4} onSubmit={send}>
        <TextField label={messages.people.name} value={name} onChange={setName} isRequired autoFocus autoComplete="off" {...(problems['name'] !== undefined && { errorMessage: problems['name'] })} />
        <TextField
          label={messages.people.email}
          type="email"
          value={email}
          onChange={setEmail}
          isRequired
          autoComplete="off"
          description={messages.people.emailHelp}
          {...(problems['email'] !== undefined && { errorMessage: problems['email'] })}
        />
        <Select
          label={messages.people.role}
          options={ROLES.map((id) => ({ id, label: messages.people.roles[id] }))}
          value={role}
          onChange={(id) => setRole(id as Role)}
          description={messages.people.roleMeans[role]}
          {...(problems['role'] !== undefined && { errorMessage: problems['role'] })}
        />
      </Form>
    </Dialog>
  );
}
