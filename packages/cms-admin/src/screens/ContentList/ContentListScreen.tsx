import {
  Box,
  Button,
  EmptyState,
  Inline,
  PageBody,
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
} from '@velocity-astro/cms-ui';
import { HOME_SLUG, takesSlugPath, type Entry } from '@velocity-astro/cms-core';
import { FileQuestion, Inbox, Plus, SearchX } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useGo } from '../../app/use-go.js';
import { paths } from '../../app/paths.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useContentTypes, useEntries, useImages, useLikeCounts } from '../../client/queries.js';
import { FieldSummary, useControlFor } from '../../fields/index.js';
import { entryAddress, entryHolds, entryImage, entryState, entryTitle, fieldAt, groupTranslations, localized, type EntryState } from '../../lib/content.js';
import { relativeTime } from '../../lib/relative-time.js';
import { smallOf } from '../../lib/small-image.js';
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
  const go = useGo();
  const { typeKey = '' } = useParams();
  const types = useContentTypes();
  const entries = useEntries({ type: typeKey, limit: PAGE });
  const images = useImages();
  const controlFor = useControlFor();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  // Asked for only when the type takes likes: a count is a column of its own then.
  const liked = types.data?.find((candidate) => candidate.key === typeKey);
  const likes = useLikeCounts(liked?.id ?? '', liked?.likes !== undefined);

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
  // A single page has no list: its address here leads straight to its entry, or to starting it.
  if (type.kind === 'single') {
    // One that is part of the settings is edited there.
    if (type.inSettings === true) return <Navigate to={paths.settingsPage(type.key)} replace />;
    if (entries.isPending) return <LoadingState shape="form" width="wide" />;
    if (entries.isError) return <ErrorState error={entries.error} onRetry={() => void entries.refetch()} />;
    const entry = groups[0]?.primary;
    return <Navigate to={entry ? paths.entry(type.key, entry.id) : paths.newEntry(type.key)} replace />;
  }
  // The page at the top of the site is what people look for first, whatever its title says.
  const isHome = (entry: Entry) => takesSlugPath(type) && entry.slug === HOME_SLUG;
  const words = query.trim();
  const shown = [...groups.filter(({ primary }) => isHome(primary)), ...groups.filter(({ primary }) => !isHome(primary))].filter(({ primary, versions }) => {
    if (!SHOWN[filter](entryState(primary))) return false;
    if (words === '') return true;
    return versions.some((entry) => entryHolds(entry, words));
  });

  // The columns the type asks for, each named by its field.
  const summaries = (type.list?.fieldPaths ?? []).flatMap((path, index) => {
    const at = fieldAt(type, {}, path);
    return at ? [{ id: `field-${index}`, path, field: at.field }] : [];
  });
  const hasPictures = type.list?.imagePath !== undefined;
  const pictures = new Map((images.data ?? []).map((image) => [image.name, smallOf(image)]));

  const takesLikes = type.likes !== undefined;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const columns: TableColumn[] = [
    { id: 'title', label: messages.contentList.columnTitle },
    ...summaries.map(({ id, field }) => ({ id, label: localized(field.label, locale), align: controlFor(field.type)?.summaryAlign ?? ('start' as const) })),
    ...(takesLikes ? [{ id: 'likes', label: messages.contentList.columnLikes, align: 'end' as const, isSecondary: true }] : []),
    { id: 'status', label: messages.contentList.columnStatus },
    ...(manyLanguages ? [{ id: 'languages', label: messages.contentList.columnLanguages, isSecondary: true }] : []),
    { id: 'updated', label: messages.contentList.columnUpdated, isSecondary: true },
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
              <Inline gap={2}>
                <Text weight="semibold">{entryTitle(type, primary.data) ?? messages.contentList.untitled}</Text>
                {isHome(primary) && <Tag tone="info">{messages.contentList.homePage}</Tag>}
              </Inline>
              <Text size="sm" tone="muted" mono>
                {entryAddress(type, primary) ?? primary.slug}
              </Text>
            </Stack>
          </Inline>
        ),
        ...Object.fromEntries(
          summaries.map(({ id, path, field }) => [id, <FieldSummary key={id} field={field} value={fieldAt(type, primary.data, path)?.value} />]),
        ),
        ...(takesLikes && {
          likes: (
            <Text size="sm" tone={(likes.data?.[primary.translationGroup] ?? 0) > 0 ? 'default' : 'muted'}>
              {likes.isSuccess ? number(likes.data[primary.translationGroup] ?? 0) : ''}
            </Text>
          ),
        }),
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
    <Button icon={Plus} collapses onPress={() => go(paths.newEntry(type.key))}>
      {messages.contentList.newEntry}
    </Button>
  );

  return (
    <PageBody>
      <Stack gap={6}>
        <PageHeader title={name} actions={newEntry} {...(entries.data && { description: messages.contentList.description(groups.length) })} />
        {entries.isPending && <LoadingState shape="table" />}
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
              <Table label={name} columns={columns} rows={rows} onRowAction={(id) => go(paths.entry(type.key, id))} />
            )}
          </>
        )}
      </Stack>
    </PageBody>
  );
}
