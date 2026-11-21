import { Box, Button, Card, EmptyState, Grid, Heading, Inline, Link, SiteWindow, Split, Stack, Stat, Table, Tag, Text, Welcome, type TableColumn, type TableRow } from '@velocity-astro/cms-ui';
import { HOME_SLUG, takesSlugPath, type ContentTypeDef, type Entry } from '@velocity-astro/cms-core';
import { ArrowRight, ExternalLink, Inbox, MousePointer2, Shapes } from 'lucide-react';
import { useGo } from '../../app/use-go.js';
import { paths } from '../../app/paths.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useContentTypes, useEntriesOfTypes, useForecast, useForms, usePipeline, useSession, useSubmissionCountsOf } from '../../client/queries.js';
import { entryState, entryTitle, groupTranslations, localized, type EntryState } from '../../lib/content.js';
import { dayPart } from '../../lib/day-part.js';
import { openSite } from '../../lib/open-site.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useMoney } from '../Contacts/pipeline.js';
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

interface Listed {
  readonly type: ContentTypeDef;
  readonly entry: Entry;
  readonly updatedAt: string;
}

/** Where the editor opens: what is waiting, the site as visitors see it, what changed last, and what came in. */
export function HomeScreen({ siteName }: HomeScreenProps) {
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const session = useSession();
  const types = useContentTypes();
  const lists = useEntriesOfTypes((types.data ?? []).map((type) => ({ type: type.key, limit: PAGE })));
  // What visitors send, and the deals made of it, are for owners and editors.
  const readsContacts = session.data !== undefined && session.data !== null && session.data.role !== 'author';

  if (types.isPending) return <LoadingState />;
  if (types.isError) return <ErrorState error={types.error} onRetry={() => void types.refetch()} />;
  if (types.data.length === 0) {
    return <EmptyState icon={Shapes} title={messages.contentList.noTypesTitle} description={messages.contentList.noTypesDescription} />;
  }

  const failed = lists.find((list) => list.isError);
  const pending = lists.some((list) => list.isPending);

  // An entry in two languages counts once, as it does in its list.
  const all: Listed[] = types.data.flatMap((type, index) =>
    groupTranslations(lists[index]?.data?.items ?? [], locale).map(({ primary, versions }) => ({
      type,
      entry: primary,
      updatedAt: versions.reduce((latest, version) => (version.updatedAt > latest ? version.updatedAt : latest), primary.updatedAt),
    })),
  );
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const count = (shown: (state: EntryState) => boolean) => all.filter(({ entry }) => shown(entryState(entry))).length;
  const newest = [...all].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  const recent = newest.slice(0, RECENT);
  // A single page is its type's one entry, and is called what the type is.
  const titleOf = ({ type, entry }: Listed) => (type.kind === 'single' ? localized(type.label, locale) : (entryTitle(type, entry.data) ?? messages.contentList.untitled));

  // What is waiting for someone: drafts, and changes not on the site yet. The latest is where to carry on.
  const waiting = count((state) => state === 'draft' || state === 'unpublishedChanges');
  const carryOn = newest.find(({ entry }) => {
    const state = entryState(entry);
    return state === 'draft' || state === 'unpublishedChanges';
  });
  // The page at the top of the site: what most people come to the editor to change.
  const home = all.find(({ type, entry }) => takesSlugPath(type) && entry.slug === HOME_SLUG);

  const greeting = session.data ? messages.home.greeting[dayPart()](session.data.name) : messages.app.home;
  const isCounted = !failed && !pending;
  const highlight = isCounted && waiting > 0 ? messages.home.waitingCount(waiting) : undefined;

  const columns: TableColumn[] = [
    { id: 'title', label: messages.contentList.columnTitle },
    { id: 'type', label: messages.home.columnType },
    { id: 'status', label: messages.contentList.columnStatus },
    { id: 'updated', label: messages.contentList.columnUpdated },
  ];
  const rows: TableRow[] = recent.map((listed) => {
    const state = entryState(listed.entry);
    return {
      id: listed.entry.id,
      cells: {
        title: <Text weight="semibold">{titleOf(listed)}</Text>,
        type: <Text tone="secondary">{localized(listed.type.label, locale)}</Text>,
        status: <Tag tone={STATE_TONE[state]}>{messages.status[state]}</Tag>,
        updated: (
          <Text size="sm" tone="muted">
            {relativeTime(listed.updatedAt, locale)}
          </Text>
        ),
      },
    };
  });
  const typeOf = new Map(recent.map(({ type, entry }) => [entry.id, type.key]));
  const homePublished = home?.entry.published?.at;

  return (
    <>
      <Welcome
        eyebrow={new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        title={isCounted ? messages.home.headline(greeting, waiting) : greeting}
        {...(highlight !== undefined && { highlight })}
        description={messages.home.description(siteName)}
        actions={
          <>
            {carryOn && (
              <Button icon={ArrowRight} onPress={() => go(paths.entry(carryOn.type.key, carryOn.entry.id))}>
                {messages.home.carryOn(titleOf(carryOn))}
              </Button>
            )}
            {home && (
              <Button variant={carryOn ? 'secondary' : 'primary'} icon={MousePointer2} onPress={() => go(paths.visualEntry(home.type.key, home.entry.id))}>
                {messages.home.editHome}
              </Button>
            )}
            <Button variant="ghost" icon={ExternalLink} onPress={() => openSite()}>
              {messages.home.viewSite}
            </Button>
          </>
        }
        aside={
          <SiteWindow
            address={window.location.host}
            src="/"
            title={messages.home.siteWindowTitle(siteName)}
            label={home ? messages.home.editHomeShort : messages.home.openSite}
            {...(homePublished !== undefined && { meta: messages.home.publishedWhen(relativeTime(homePublished, locale)) })}
            onPress={() => (home ? go(paths.visualEntry(home.type.key, home.entry.id)) : openSite())}
          />
        }
      />
      <Box paddingX={12} paddingY={10}>
        <Stack gap={8}>
          {failed && <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />}
          {!failed && pending && <LoadingState shape="summary" />}
          {isCounted && (
            <>
              <Grid columns={3} gap={4}>
                <Stat label={messages.home.published} value={number(count((state) => state === 'published' || state === 'unpublishedChanges'))} detail={messages.home.publishedDetail} />
                <Stat label={messages.home.drafts} value={number(count((state) => state === 'draft'))} detail={messages.home.draftsDetail} />
                <Stat label={messages.home.changed} value={number(count((state) => state === 'unpublishedChanges'))} detail={messages.home.changedDetail} />
              </Grid>
              <Split asideLabel={messages.home.asideLabel} aside={readsContacts ? <Audience /> : null}>
                <Stack gap={3}>
                  <Heading level={2}>{messages.home.recentTitle}</Heading>
                  {rows.length === 0 ? (
                    <EmptyState icon={Inbox} title={messages.home.recentEmpty} description={messages.home.recentEmptyDescription} />
                  ) : (
                    <Table label={messages.home.recentTitle} columns={columns} rows={rows} onRowAction={(id) => go(paths.entry(typeOf.get(id) ?? '', id))} />
                  )}
                </Stack>
                {session.data && readsContacts && <FollowUps userId={session.data.id} />}
              </Split>
            </>
          )}
        </Stack>
      </Box>
    </>
  );
}

/**
 * What came in from visitors, and what it may be worth: the forms with something new, and the
 * pipeline's open deals. Each part shows nothing if it could not be asked for: Home is not lost over it.
 */
function Audience() {
  const messages = useMessages();
  const locale = useLocale();
  const forms = useForms();
  const counts = useSubmissionCountsOf((forms.data ?? []).map((form) => form.id));
  const forecast = useForecast();
  const pipeline = usePipeline();
  const money = useMoney(pipeline.data?.currency ?? forecast.data?.currency);

  const withNew = (forms.data ?? [])
    .map((form, index) => ({ form, fresh: counts[index]?.data?.new ?? 0 }))
    .filter(({ fresh }) => fresh > 0);
  const fresh = withNew.reduce((sum, { fresh: one }) => sum + one, 0);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);

  return (
    <>
      {forms.isSuccess && counts.every((one) => one.isSuccess) && (
        <Card title={messages.home.inboxTitle} actions={<Link href={paths.forms}>{messages.home.allForms}</Link>}>
          <Stack gap={3}>
            <Inline gap={2} align="baseline">
              <Heading level={3} size="xl">
                {number(fresh)}
              </Heading>
              <Text tone="muted">{messages.home.inboxNew}</Text>
            </Inline>
            {withNew.length === 0 ? (
              <Text size="sm" tone="muted">
                {messages.home.inboxEmpty}
              </Text>
            ) : (
              <Stack gap={2}>
                {withNew.map(({ form, fresh: one }) => (
                  <Inline key={form.id} justify="between" gap={2}>
                    <Link href={paths.form(form.id)}>{localized(form.label, locale)}</Link>
                    <Tag tone="info">{messages.forms.newCount(one)}</Tag>
                  </Inline>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      )}
      {forecast.isSuccess && forecast.data.stages.some((stage) => stage.count > 0) && (
        <Card title={messages.home.pipelineTitle} actions={<Link href={paths.deals}>{messages.app.deals}</Link>}>
          <Stack gap={3}>
            <Inline gap={2} align="baseline">
              <Heading level={3} size="xl">
                {money(forecast.data.open)}
              </Heading>
              <Text tone="muted">{messages.home.pipelineOpen}</Text>
            </Inline>
            <Text size="sm" tone="muted">
              {messages.home.pipelineDetail(money(forecast.data.weighted), money(forecast.data.won))}
            </Text>
          </Stack>
        </Card>
      )}
    </>
  );
}
