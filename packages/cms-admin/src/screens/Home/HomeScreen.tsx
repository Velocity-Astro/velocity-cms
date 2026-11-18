import { Box, Button, EmptyState, Grid, Heading, Inline, PageHeader, Stack, Stat, Table, Tag, Text, type TableColumn, type TableRow } from '@velocity/cms-ui';
import type { ContentTypeDef, Entry } from '@velocity/cms-core';
import { Inbox, Plus, Shapes } from 'lucide-react';
import { useGo } from '../../app/use-go.js';
import { paths } from '../../app/paths.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useContentTypes, useEntriesOfTypes, useSession } from '../../client/queries.js';
import { entryState, entryTitle, groupTranslations, localized, type EntryState } from '../../lib/content.js';
import { dayPart } from '../../lib/day-part.js';
import { relativeTime } from '../../lib/relative-time.js';
import { FollowUps } from './FollowUps.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

/** How each state is coloured. The words come from the messages. */
const STATE_TONE = { draft: 'neutral', scheduled: 'info', published: 'success', unpublishedChanges: 'warning' } as const satisfies Record<
  EntryState,
  string
>;

/** As many entries of each type as one request may carry. */
const PAGE = 200;
/** How many of the latest changes are listed. */
const RECENT = 8;

export interface HomeScreenProps {
  readonly siteName: string;
}

/** Where the editor opens: how the site's content stands, what changed last, and a way to add more. */
export function HomeScreen({ siteName }: HomeScreenProps) {
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const session = useSession();
  const types = useContentTypes();
  const lists = useEntriesOfTypes((types.data ?? []).map((type) => ({ type: type.key, limit: PAGE })));

  if (types.isPending) return <LoadingState />;
  if (types.isError) return <ErrorState error={types.error} onRetry={() => void types.refetch()} />;
  if (types.data.length === 0) {
    return <EmptyState icon={Shapes} title={messages.contentList.noTypesTitle} description={messages.contentList.noTypesDescription} />;
  }

  const failed = lists.find((list) => list.isError);
  const pending = lists.some((list) => list.isPending);

  // An entry in two languages counts once, as it does in its list.
  const all: { readonly type: ContentTypeDef; readonly entry: Entry; readonly updatedAt: string }[] = types.data.flatMap((type, index) =>
    groupTranslations(lists[index]?.data?.items ?? [], locale).map(({ primary, versions }) => ({
      type,
      entry: primary,
      updatedAt: versions.reduce((latest, version) => (version.updatedAt > latest ? version.updatedAt : latest), primary.updatedAt),
    })),
  );
  const count = (shown: (state: EntryState) => boolean) => new Intl.NumberFormat(locale).format(all.filter(({ entry }) => shown(entryState(entry))).length);
  const recent = [...all].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)).slice(0, RECENT);

  const columns: TableColumn[] = [
    { id: 'title', label: messages.contentList.columnTitle },
    { id: 'type', label: messages.home.columnType },
    { id: 'status', label: messages.contentList.columnStatus },
    { id: 'updated', label: messages.contentList.columnUpdated },
  ];
  const rows: TableRow[] = recent.map(({ type, entry, updatedAt }) => {
    const state = entryState(entry);
    return {
      id: entry.id,
      cells: {
        title: <Text weight="semibold">{entryTitle(type, entry.data) ?? messages.contentList.untitled}</Text>,
        type: <Text tone="secondary">{localized(type.label, locale)}</Text>,
        status: <Tag tone={STATE_TONE[state]}>{messages.status[state]}</Tag>,
        updated: (
          <Text size="sm" tone="muted">
            {relativeTime(updatedAt, locale)}
          </Text>
        ),
      },
    };
  });
  const typeOf = new Map(recent.map(({ type, entry }) => [entry.id, type.key]));

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={8}>
        <PageHeader
          title={session.data ? messages.home.greeting[dayPart()](session.data.name) : messages.app.home}
          description={messages.home.description(siteName)}
        />
        {failed && <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />}
        {!failed && pending && <LoadingState shape="summary" />}
        {!failed && !pending && (
          <>
            <Grid columns={3} gap={4}>
              <Stat label={messages.home.published} value={count((state) => state === 'published' || state === 'unpublishedChanges')} detail={messages.home.publishedDetail} />
              <Stat label={messages.home.drafts} value={count((state) => state === 'draft')} detail={messages.home.draftsDetail} />
              <Stat label={messages.home.changed} value={count((state) => state === 'unpublishedChanges')} detail={messages.home.changedDetail} />
            </Grid>
            <Stack gap={3}>
              <Heading level={2}>{messages.home.addTitle}</Heading>
              <Inline gap={2} wrap>
                {types.data
                  .filter((type) => type.kind !== 'single')
                  .map((type) => (
                  <Button key={type.id} variant="secondary" icon={Plus} onPress={() => go(paths.newEntry(type.key))}>
                    {localized(type.label, locale)}
                  </Button>
                ))}
              </Inline>
            </Stack>
            {/* Contacts are for owners and editors. */}
            {session.data && session.data.role !== 'author' && <FollowUps userId={session.data.id} />}
            <Stack gap={3}>
              <Heading level={2}>{messages.home.recentTitle}</Heading>
              {rows.length === 0 ? (
                <EmptyState icon={Inbox} title={messages.home.recentEmpty} description={messages.home.recentEmptyDescription} />
              ) : (
                <Table
                  label={messages.home.recentTitle}
                  columns={columns}
                  rows={rows}
                  onRowAction={(id) => go(paths.entry(typeOf.get(id) ?? '', id))}
                />
              )}
            </Stack>
          </>
        )}
      </Stack>
    </Box>
  );
}
