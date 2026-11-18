import { Button, Dialog, Form, IconButton, Stack, Table, Text, TextField, toast, type TableColumn, type TableRow } from '@velocity-astro/cms-ui';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAddPasskey, usePasskeys, useRemovePasskey } from '../client/queries.js';
import { useClosing } from '../lib/use-closing.js';
import { relativeTime } from '../lib/relative-time.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { ErrorState, LoadingState } from './RequestState.js';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The signed-in person's own passkeys: the ones they have, a way to remove each, and a way to add one. */
export function PasskeysDialog({ onClose }: { readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const locale = useLocale();
  const passkeys = usePasskeys();
  const add = useAddPasskey();
  const remove = useRemovePasskey();
  const [name, setName] = useState<string>(messages.app.passkeyDefaultName);
  const [problem, setProblem] = useState<string | null>(null);

  const make = () => {
    setProblem(null);
    add.mutate(name.trim() === '' ? messages.app.passkeyDefaultName : name.trim(), {
      onSuccess: () => toast({ title: messages.app.passkeyAdded, description: messages.app.passkeyAddedDescription, tone: 'success' }),
      // The browser's prompt was closed, or the device has no way to make one. The window stays
      // open so the person can try again.
      onError: (error) => setProblem(messageOf(error)),
    });
  };

  const columns: TableColumn[] = [
    { id: 'name', label: messages.app.passkeyColumnName },
    { id: 'added', label: messages.app.passkeyColumnAdded },
    { id: 'actions', label: messages.app.passkeyColumnActions, align: 'end' },
  ];
  const rows: TableRow[] = (passkeys.data ?? []).map((passkey) => {
    const called = passkey.name === '' ? messages.app.passkeyUnnamed : passkey.name;
    return {
      id: passkey.id,
      cells: {
        name: <Text weight="semibold">{called}</Text>,
        added: (
          <Text size="sm" tone="muted">
            {passkey.createdAt === undefined ? messages.app.passkeyAddedUnknown : relativeTime(passkey.createdAt, locale)}
          </Text>
        ),
        actions: (
          <IconButton
            label={messages.app.passkeyRemove(called)}
            icon={Trash2}
            isDisabled={remove.isPending}
            onPress={() =>
              remove.mutate(passkey.id, {
                onSuccess: () => toast({ title: messages.app.passkeyRemoved(called), description: messages.app.passkeyRemovedDescription, tone: 'success' }),
                onError: (error) => toast({ title: messages.app.passkeyNotRemoved, description: messageOf(error), tone: 'danger' }),
              })
            }
          />
        ),
      },
    };
  });

  return (
    <Dialog
      {...dialog}
      title={messages.app.passkeys}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.app.passkeyDone}
          </Button>
          <Button isPending={add.isPending} onPress={make}>
            {messages.app.passkeyAdd}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        <Text tone="secondary">{messages.app.passkeyDescription}</Text>
        {passkeys.isPending && <LoadingState shape="table" />}
        {passkeys.isError && <ErrorState error={passkeys.error} onRetry={() => void passkeys.refetch()} />}
        {passkeys.isSuccess && rows.length === 0 && <Text tone="muted">{messages.app.passkeyNone}</Text>}
        {passkeys.isSuccess && rows.length > 0 && <Table label={messages.app.passkeys} columns={columns} rows={rows} />}
        <Form label={messages.app.passkeyTitle} onSubmit={make}>
          <TextField
            label={messages.app.passkeyName}
            description={messages.app.passkeyNameHelp}
            value={name}
            onChange={setName}
            autoFocus
            {...(problem !== null && { errorMessage: `${messages.app.passkeyNotAdded}. ${problem}` })}
          />
        </Form>
      </Stack>
    </Dialog>
  );
}
