import type { Entry } from '@velocity-astro/cms-core';
import { Box, Button, ConfirmDialog, EmptyState, Inline, PageHeader, Stack, Table, Text, toast, type TableColumn, type TableRow } from '@velocity-astro/cms-ui';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { paths } from '../../app/paths.js';
import { useGo } from '../../app/use-go.js';
import { useContentTypes, useDeleteEntry, useRestoreEntry, useSession, useTrash } from '../../client/queries.js';
import { entryTitle, languageName, localized } from '../../lib/content.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Everything that was moved to the trash, with the way to bring each back or delete it for good. */
export function TrashScreen() {
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const session = useSession();
  const types = useContentTypes();
  const trash = useTrash();
  const restore = useRestoreEntry();
  const remove = useDeleteEntry();
  // The entry someone is being asked about deleting for good.
  const [asking, setAsking] = useState<{ readonly id: string; readonly name: string } | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  // Deleting cannot be undone, so it is for people who may publish.
  const mayDelete = session.data !== null && session.data !== undefined && session.data.role !== 'author';

  const typeOf = (entry: Entry) => types.data?.find((type) => type.id === entry.typeId);
  const nameOf = (entry: Entry) => {
    const type = typeOf(entry);
    return (type && entryTitle(type, entry.data)) ?? messages.contentList.untitled;
  };

  const columns: TableColumn[] = [
    { id: 'name', label: messages.trash.columnName },
    { id: 'type', label: messages.trash.columnType },
    { id: 'moved', label: messages.trash.columnMoved },
    { id: 'actions', label: messages.trash.columnActions, align: 'end' },
  ];
  const rows: TableRow[] = (trash.data?.items ?? []).map((entry) => {
    const type = typeOf(entry);
    const name = nameOf(entry);
    return {
      id: entry.id,
      cells: {
        name: (
          <Stack gap={0}>
            <Text weight="semibold">{name}</Text>
            <Text size="sm" tone="muted">
              {messages.trash.detail(entry.slug, languageName(entry.locale, locale))}
            </Text>
          </Stack>
        ),
        type: type ? localized(type.label, locale) : <Text tone="muted">{messages.trash.typeArchived}</Text>,
        moved: (
          <Text size="sm" tone="muted">
            {entry.deletedAt === undefined ? '' : relativeTime(entry.deletedAt, locale)}
          </Text>
        ),
        actions: (
          <Inline gap={2} justify="end">
            <Button
              variant="secondary"
              size="sm"
              isPending={restore.isPending && restore.variables === entry.id}
              onPress={() =>
                restore.mutate(entry.id, {
                  onSuccess: () => {
                    toast({ title: messages.trash.restored(name), description: messages.trash.restoredDescription, tone: 'success' });
                    if (type) go(paths.entry(type.key, entry.id));
                  },
                  onError: (error) => toast({ title: messages.trash.notRestored, description: messageOf(error), tone: 'danger' }),
                })
              }
            >
              {messages.trash.restore(name)}
            </Button>
            {mayDelete && (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setAsking({ id: entry.id, name });
                  setIsAsking(true);
                }}
              >
                {messages.trash.delete(name)}
              </Button>
            )}
          </Inline>
        ),
      },
    };
  });

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader title={messages.trash.title} description={messages.trash.description} />
        {(trash.isPending || types.isPending) && <LoadingState shape="table" />}
        {trash.isError && <ErrorState error={trash.error} onRetry={() => void trash.refetch()} />}
        {types.isError && <ErrorState error={types.error} onRetry={() => void types.refetch()} />}
        {trash.isSuccess && types.isSuccess && rows.length === 0 && (
          <EmptyState icon={Trash2} title={messages.trash.emptyTitle} description={messages.trash.emptyDescription} />
        )}
        {trash.isSuccess && types.isSuccess && rows.length > 0 && <Table label={messages.trash.title} columns={columns} rows={rows} />}
      </Stack>
      {asking !== null && (
        <ConfirmDialog
          isOpen={isAsking}
          onOpenChange={setIsAsking}
          title={messages.trash.deleteTitle(asking.name)}
          confirmLabel={messages.trash.deleteConfirm}
          cancelLabel={messages.editor.cancel}
          tone="danger"
          isPending={remove.isPending}
          onConfirm={() =>
            remove.mutate(asking.id, {
              onSuccess: () => {
                toast({ title: messages.trash.deleted(asking.name), tone: 'success' });
                setIsAsking(false);
              },
              onError: (error) => {
                toast({ title: messages.trash.notDeleted, description: messageOf(error), tone: 'danger' });
                setIsAsking(false);
              },
            })
          }
        >
          {messages.trash.deleteDescription}
        </ConfirmDialog>
      )}
    </Box>
  );
}
