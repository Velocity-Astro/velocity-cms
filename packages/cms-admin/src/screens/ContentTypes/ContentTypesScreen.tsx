import { liveFields, type ContentTypeKind } from '@velocity-astro/cms-core';
import { Box, Button, Dialog, EmptyState, Form, Heading, PageHeader, Segmented, Stack, Table, Text, TextField, toast, type TableColumn, type TableRow } from '@velocity-astro/cms-ui';
import { Plus, Shapes } from 'lucide-react';
import { useState } from 'react';
import { useGo } from '../../app/use-go.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { paths } from '../../app/paths.js';
import { AdminRequestError } from '../../client/errors.js';
import { useArchivedContentTypes, useContentTypes, useCreateContentType, useRestoreContentType } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { relativeTime } from '../../lib/relative-time.js';
import { typeKeyFrom } from '../../lib/keys.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { useClosing } from '../../lib/use-closing.js';

const NO_PROBLEMS: Readonly<Record<string, string>> = {};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Every kind of content the site has, and the way to start a new one. */
export function ContentTypesScreen() {
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const types = useContentTypes();
  const [isCreating, setCreating] = useState(false);
  const archived = useArchivedContentTypes();
  const restore = useRestoreContentType();

  const archivedColumns: TableColumn[] = [
    { id: 'name', label: messages.builder.columnName },
    { id: 'archived', label: messages.builder.columnArchived },
    { id: 'actions', label: messages.builder.columnActions, align: 'end' },
  ];
  const archivedRows: TableRow[] = (archived.data ?? []).map((type) => {
    const name = localized(type.label, locale);
    return {
      id: type.key,
      cells: {
        name: (
          <Stack gap={0}>
            <Text weight="semibold">{name}</Text>
            <Text size="sm" tone="muted">
              {type.key}
            </Text>
          </Stack>
        ),
        archived: (
          <Text size="sm" tone="muted">
            {type.deletedAt === undefined ? '' : relativeTime(type.deletedAt, locale)}
          </Text>
        ),
        actions: (
          <Button
            variant="secondary"
            size="sm"
            isPending={restore.isPending && restore.variables === type.id}
            onPress={() =>
              restore.mutate(type.id, {
                onSuccess: () => toast({ title: messages.builder.typeRestored(name), description: messages.builder.typeRestoredDescription, tone: 'success' }),
                onError: (error) => toast({ title: messages.builder.typeNotRestored, description: messageOf(error), tone: 'danger' }),
              })
            }
          >
            {messages.builder.restoreType(name)}
          </Button>
        ),
      },
    };
  });

  const columns: TableColumn[] = [
    { id: 'name', label: messages.builder.columnName },
    { id: 'kind', label: messages.builder.columnKind },
    { id: 'fields', label: messages.builder.columnFields },
    { id: 'address', label: messages.builder.columnAddress },
  ];
  const rows: TableRow[] = (types.data ?? []).map((type) => ({
    id: type.key,
    cells: {
      name: (
        <Stack gap={0}>
          <Text weight="semibold">{localized(type.label, locale)}</Text>
          <Text size="sm" tone="muted">
            {type.key}
          </Text>
        </Stack>
      ),
      kind: type.kind === 'single' ? messages.builder.kindSingle : messages.builder.kindCollection,
      fields: messages.builder.fieldCount(liveFields(type.fields).length),
      address: type.urlPattern ?? <Text tone="muted">{messages.builder.noAddress}</Text>,
    },
  }));
  const create = (
    <Button icon={Plus} onPress={() => setCreating(true)}>
      {messages.builder.newType}
    </Button>
  );

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader title={messages.builder.title} description={messages.builder.description} actions={create} />
        {types.isPending && <LoadingState shape="table" />}
        {types.isError && <ErrorState error={types.error} onRetry={() => void types.refetch()} />}
        {types.isSuccess && rows.length === 0 && (
          <EmptyState icon={Shapes} title={messages.builder.emptyTitle} description={messages.builder.emptyDescription} action={create} />
        )}
        {types.isSuccess && rows.length > 0 && <Table label={messages.builder.title} columns={columns} rows={rows} onRowAction={(key) => go(paths.type(key))} />}
        {archived.isError && <ErrorState error={archived.error} onRetry={() => void archived.refetch()} />}
        {archived.isSuccess && archivedRows.length > 0 && (
          <Stack gap={3}>
            <Stack gap={0}>
              <Heading level={2} size="md">
                {messages.builder.archivedTitle}
              </Heading>
              <Text size="sm" tone="muted">
                {messages.builder.archivedHelp}
              </Text>
            </Stack>
            <Table label={messages.builder.archivedTypes} columns={archivedColumns} rows={archivedRows} />
          </Stack>
        )}
      </Stack>
      {/* Made anew each time it opens, so it never shows what was typed last time. */}
      {isCreating && <NewTypeDialog onClose={() => setCreating(false)} />}
    </Box>
  );
}

/** The window a content type is started in: what it is called, its key and where its pages live. */
function NewTypeDialog({ onClose }: { readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const create = useCreateContentType();
  const [kind, setKind] = useState<ContentTypeKind>('collection');
  const isSingle = kind === 'single';
  const [name, setName] = useState('');
  // The key follows the name until someone writes a key of their own.
  const [ownKey, setOwnKey] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [problems, setProblems] = useState(NO_PROBLEMS);
  const key = ownKey ?? typeKeyFrom(name);

  const send = () => {
    const missing = { ...(name.trim() === '' && { label: messages.builder.typeNameNeeded }), ...(key === '' && { key: messages.builder.keyNeeded }) };
    setProblems(missing);
    if (Object.keys(missing).length > 0) return;
    create.mutate(
      { key, kind, label: { [locale.split('-')[0] ?? locale]: name.trim() }, ...(address.trim() !== '' && { urlPattern: address.trim() }) },
      {
        onSuccess: (type) => {
          toast({ title: messages.builder.typeCreated(name.trim()), description: messages.builder.typeCreatedDescription, tone: 'success' });
          close();
          go(paths.type(type.key));
        },
        onError: (error) => {
          const issues = error instanceof AdminRequestError ? error.issues : [];
          // What the server said about a field goes on that field. Anything else is about the key.
          setProblems(issues.length > 0 ? Object.fromEntries(issues.map((issue) => [String(issue.path[0] ?? 'key'), error.message])) : { key: messageOf(error) });
          toast({ title: messages.builder.typeNotCreated, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  return (
    <Dialog
      {...dialog}
      title={messages.builder.newTypeTitle}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={create.isPending} onPress={send}>
            {messages.builder.typeCreate}
          </Button>
        </>
      }
    >
      <Form label={messages.builder.newTypeTitle} gap={4} onSubmit={send}>
        <Stack gap={2}>
          <Segmented
            label={messages.builder.typeKind}
            selected={kind}
            onChange={(id) => setKind(id as ContentTypeKind)}
            options={[
              { id: 'collection', label: messages.builder.kindCollection },
              { id: 'single', label: messages.builder.kindSingle },
            ]}
          />
          <Text size="sm" tone="muted">
            {isSingle ? messages.builder.kindSingleHelp : messages.builder.kindCollectionHelp}
          </Text>
        </Stack>
        <TextField
          label={messages.builder.typeName}
          description={isSingle ? messages.builder.typeNameHelpSingle : messages.builder.typeNameHelp}
          value={name}
          onChange={setName}
          isRequired
          autoFocus
          autoComplete="off"
          {...(problems['label'] !== undefined && { errorMessage: problems['label'] })}
        />
        <TextField
          label={messages.builder.typeKey}
          description={messages.builder.typeKeyHelp}
          value={key}
          onChange={setOwnKey}
          isRequired
          autoComplete="off"
          {...(problems['key'] !== undefined && { errorMessage: problems['key'] })}
        />
        <TextField
          label={isSingle ? messages.builder.typeAddressSingle : messages.builder.typeAddress}
          description={isSingle ? messages.builder.typeAddressHelpSingle : messages.builder.typeAddressHelp}
          value={address}
          onChange={setAddress}
          autoComplete="off"
          {...(problems['urlPattern'] !== undefined && { errorMessage: problems['urlPattern'] })}
        />
      </Form>
    </Dialog>
  );
}
