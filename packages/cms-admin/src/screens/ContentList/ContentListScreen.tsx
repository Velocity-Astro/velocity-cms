import {
  Box,
  Button,
  EmptyState,
  Inline,
  PageHeader,
  SearchField,
  Segmented,
  Stack,
  Table,
  Tag,
  Text,
  Thumbnail,
  type TableColumn,
  type TableRow,
} from '@velocity/cms-ui';
import { FileQuestion, Inbox, Plus, SearchX } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { paths } from '../../app/paths.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useContentTypes, useEntries, useImages } from '../../client/queries.js';
import { FieldSummary, useControlFor } from '../../fields/index.js';
import { entryAddress, entryImage, entryState, entryTitle, fieldAt, groupTranslations, localized, type EntryState } from '../../lib/content.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

/** How each state is coloured. The words come from the messages. */
const STATE_TONE = { draft: 'neutral', scheduled: 'info', published: 'success', unpublishedChanges: 'warning' } as const satisfies Record<
  EntryState,
  string
>;

type Filter = 'all' | 'published' | 'drafts' | 'changed';
const SHOWN: Readonly<Record<Filter, (state: EntryState) => boolean>> = {
  all: () => true,
  published: (state) => state === 'published' || state === 'unpublishedChanges',
  drafts: (state) => state === 'draft',
  changed: (state) => state === 'unpublishedChanges',
};

/** A picture's address as a prop, left out when there is none. */
const withSrc = (src: string | undefined) => (src === undefined ? {} : { src });

/** As many entries as one request may carry. Paging comes with search on the server. */
const PAGE = 200;

/** Every entry of one content type. */
export function ContentListScreen() {
  const messages = useMessages();
  const locale = useLocale();
  const navigate = useNavigate();
  const { typeKey = '' } = useParams();
  const types = useContentTypes();
  const entries = useEntries({ type: typeKey, limit: PAGE });
  const images = useImages();
  const controlFor = useControlFor();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

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
  // An entry in two languages is one row, not two that look the same.
  const groups = groupTranslations(entries.data?.items ?? [], locale);
  const manyLanguages = groups.some((group) => group.versions.length > 1) || new Set(groups.map((group) => group.primary.locale)).size > 1;
  const words = query.trim().toLowerCase();
  const shown = groups.filter(({ primary, versions }) => {
    if (!SHOWN[filter](entryState(primary))) return false;
    if (words === '') return true;
    return versions.some((entry) => `${entryTitle(type, entry.data) ?? ''} ${entry.slug}`.toLowerCase().includes(words));
  });

  // The columns the type asks for, each named by its field.
  const summaries = (type.list?.fieldPaths ?? []).flatMap((path, index) => {
    const at = fieldAt(type, {}, path);
    return at ? [{ id: `field-${index}`, path, field: at.field }] : [];
  });
  const hasPictures = type.list?.imagePath !== undefined;
  const pictures = new Map((images.data ?? []).map((image) => [image.name, image.url]));

  const columns: TableColumn[] = [
    { id: 'title', label: messages.contentList.columnTitle },
    ...summaries.map(({ id, field }) => ({ id, label: localized(field.label, locale), align: controlFor(field.type)?.summaryAlign ?? ('start' as const) })),
    { id: 'status', label: messages.contentList.columnStatus },
    ...(manyLanguages ? [{ id: 'languages', label: messages.contentList.columnLanguages }] : []),
    { id: 'updated', label: messages.contentList.columnUpdated },
  ];
  const rows: TableRow[] = shown.map(({ primary, versions }) => {
    const state = entryState(primary);
    const updated = versions.reduce((latest, entry) => (entry.updatedAt > latest ? entry.updatedAt : latest), primary.updatedAt);
    return {
      id: primary.id,
      cells: {
        title: (
          <Inline gap={3}>
            {hasPictures && <Thumbnail {...withSrc(pictures.get(entryImage(type, primary.data) ?? ''))} />}
            <Stack gap={0}>
              <Text weight="semibold">{entryTitle(type, primary.data) ?? messages.contentList.untitled}</Text>
              <Text size="sm" tone="muted" mono>
                {entryAddress(type, primary) ?? primary.slug}
              </Text>
            </Stack>
          </Inline>
        ),
        ...Object.fromEntries(
          summaries.map(({ id, path, field }) => [id, <FieldSummary key={id} field={field} value={fieldAt(type, primary.data, path)?.value} />]),
        ),
        status: <Tag tone={STATE_TONE[state]}>{messages.status[state]}</Tag>,
        ...(manyLanguages && {
          languages: (
            <Inline gap={1}>
              {versions.map((entry) => (
                <Tag key={entry.id}>{entry.locale.toUpperCase()}</Tag>
              ))}
            </Inline>
          ),
        }),
        updated: (
          <Text size="sm" tone="muted">
            {relativeTime(updated, locale)}
          </Text>
        ),
      },
    };
  });

  const newEntry = (
    <Button icon={Plus} onPress={() => void navigate(paths.newEntry(type.key))}>
      {messages.contentList.newEntry}
    </Button>
  );

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader title={name} actions={newEntry} {...(entries.data && { description: messages.contentList.description(groups.length) })} />
        {entries.isPending && <LoadingState />}
        {entries.isError && <ErrorState error={entries.error} onRetry={() => void entries.refetch()} />}
        {entries.isSuccess && groups.length === 0 && (
          <EmptyState icon={Inbox} title={messages.contentList.emptyTitle(name)} description={messages.contentList.emptyDescription} />
        )}
        {entries.isSuccess && groups.length > 0 && (
          <>
            <Inline justify="between" gap={4} wrap>
              <Segmented
                label={messages.contentList.filter}
                selected={filter}
                onChange={(id) => setFilter(id as Filter)}
                options={[
                  { id: 'all', label: messages.contentList.filterAll },
                  { id: 'published', label: messages.contentList.filterPublished },
                  { id: 'drafts', label: messages.contentList.filterDrafts },
                  { id: 'changed', label: messages.contentList.filterChanged },
                ]}
              />
              <Box maxWidth="xs" grow>
                <SearchField
                  label={messages.contentList.search(name)}
                  placeholder={messages.contentList.searchPlaceholder}
                  clearLabel={messages.contentList.clearSearch}
                  value={query}
                  onChange={setQuery}
                />
              </Box>
            </Inline>
            {rows.length === 0 ? (
              <EmptyState icon={SearchX} title={messages.contentList.noMatchesTitle} description={messages.contentList.noMatchesDescription} />
            ) : (
              <Table label={name} columns={columns} rows={rows} onRowAction={(id) => void navigate(paths.entry(type.key, id))} />
            )}
          </>
        )}
      </Stack>
    </Box>
  );
}
