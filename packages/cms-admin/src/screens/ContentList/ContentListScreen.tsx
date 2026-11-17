import { Box, Button, EmptyState, PageHeader, Stack, Table, Tag, type TableColumn, type TableRow } from '@velocity/cms-ui';
import { FileQuestion, Inbox, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { paths } from '../../app/paths.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useContentTypes, useEntries } from '../../client/queries.js';
import { entryState, entryTitle, languageName, localized, type EntryState } from '../../lib/content.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

/** How each state is coloured. The words come from the messages. */
const STATE_TONE = { draft: 'neutral', scheduled: 'info', published: 'success', unpublishedChanges: 'warning' } as const satisfies Record<
  EntryState,
  string
>;

/** Every entry of one content type. */
export function ContentListScreen() {
  const messages = useMessages();
  const locale = useLocale();
  const navigate = useNavigate();
  const { typeKey = '' } = useParams();
  const types = useContentTypes();
  const entries = useEntries({ type: typeKey });

  if (types.isPending) return <LoadingState />;
  if (types.isError) return <ErrorState error={types.error} onRetry={() => void types.refetch()} />;

  const type = types.data.find((candidate) => candidate.key === typeKey);
  if (!type) {
    return (
      <EmptyState
        icon={FileQuestion}
        title={messages.contentList.typeNotFoundTitle}
        description={messages.contentList.typeNotFoundDescription}
      />
    );
  }

  const name = localized(type.label, locale);
  const items = entries.data?.items ?? [];
  // An entry in two languages is two rows with the same title. The column that tells them
  // apart is only worth its space on a site that has more than one language.
  const manyLanguages = new Set(items.map((entry) => entry.locale)).size > 1;
  const columns: TableColumn[] = [
    { id: 'title', label: messages.contentList.columnTitle },
    ...(manyLanguages ? [{ id: 'language', label: messages.contentList.columnLanguage }] : []),
    { id: 'status', label: messages.contentList.columnStatus },
    { id: 'updated', label: messages.contentList.columnUpdated },
  ];
  const rows: TableRow[] = items.map((entry) => {
    const state = entryState(entry);
    return {
      id: entry.id,
      cells: {
        title: entryTitle(type, entry.data) ?? messages.contentList.untitled,
        ...(manyLanguages && { language: languageName(entry.locale, locale) }),
        status: <Tag tone={STATE_TONE[state]}>{messages.status[state]}</Tag>,
        updated: relativeTime(entry.updatedAt, locale),
      },
    };
  });

  const newEntry = (
    <Button icon={Plus} onPress={() => void navigate(paths.newEntry(type.key))}>
      {messages.contentList.newEntry}
    </Button>
  );

  return (
    <Box padding={8}>
      <Stack gap={6}>
        <PageHeader
          title={name}
          actions={newEntry}
          {...(entries.data && { description: messages.contentList.description(entries.data.total) })}
        />
        {entries.isPending && <LoadingState />}
        {entries.isError && <ErrorState error={entries.error} onRetry={() => void entries.refetch()} />}
        {entries.isSuccess && rows.length === 0 && (
          <EmptyState icon={Inbox} title={messages.contentList.emptyTitle(name)} description={messages.contentList.emptyDescription} />
        )}
        {entries.isSuccess && rows.length > 0 && (
          <Table label={name} columns={columns} rows={rows} onRowAction={(id) => void navigate(paths.entry(type.key, id))} />
        )}
      </Stack>
    </Box>
  );
}
