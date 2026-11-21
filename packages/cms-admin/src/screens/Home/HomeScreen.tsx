import { BarChart, Box, Button, Card, EmptyState, Grid, Inline, Link, SiteWindow, Split, Stack, Stat, Table, Tag, Text, Welcome, type TableColumn, type TableRow } from '@velocity-astro/cms-ui';
import { HOME_SLUG, takesSlugPath, type ContentTypeDef, type Entry } from '@velocity-astro/cms-core';
import { ArrowRight, ExternalLink, Inbox, MousePointer2, Shapes } from 'lucide-react';
import { useGo } from '../../app/use-go.js';
import { paths } from '../../app/paths.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useContentTypes, useEntriesOfTypes, useForecast, useForms, usePipeline, useSession, useSubmissionCountsOf, useSubmissionLists } from '../../client/queries.js';
import { entryState, entryTitle, groupTranslations, localized, type EntryState } from '../../lib/content.js';
import { dayPart } from '../../lib/day-part.js';
import { openSite } from '../../lib/open-site.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useMoney, useStageName } from '../Contacts/pipeline.js';
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
/** How many days of submissions the chart shows, today last. */
const DAYS = 14;

export interface HomeScreenProps {
  readonly siteName: string;
}

interface Listed {
  readonly type: ContentTypeDef;
  readonly entry: Entry;
  readonly updatedAt: string;
}

/** Where the editor opens: what is waiting, how the content and what came in stand, and what changed last. */
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
  const byType = types.data.map((type, index) => ({
    type,
    listed: groupTranslations(lists[index]?.data?.items ?? [], locale).map(({ primary, versions }) => ({
      type,
      entry: primary,
      updatedAt: versions.reduce((latest, version) => (version.updatedAt > latest ? version.updatedAt : latest), primary.updatedAt),
    })),
  }));
  const all: Listed[] = byType.flatMap(({ listed }) => listed);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const count = (shown: (state: EntryState) => boolean) => all.filter(({ entry }) => shown(entryState(entry))).length;
  const newest = [...all].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  const recent = newest.slice(0, RECENT);
  // A single page is its type's one entry, and is called what the type is.
  const titleOf = ({ type, entry }: Listed) => (type.kind === 'single' ? localized(type.label, locale) : (entryTitle(type, entry.data) ?? messages.contentList.untitled));

  // What is waiting for someone: drafts, and changes not on the site yet. The latest is where to carry on.
  const isWaiting = (state: EntryState) => state === 'draft' || state === 'unpublishedChanges';
  const waiting = count(isWaiting);
  const carryOn = newest.find(({ entry }) => isWaiting(entryState(entry)));
  // The page at the top of the site: what most people come to the editor to change.
  const home = all.find(({ type, entry }) => takesSlugPath(type) && entry.slug === HOME_SLUG);
  const isCounted = !failed && !pending;
  const greeting = session.data ? messages.home.greeting[dayPart()](session.data.name) : messages.app.home;
  const homePublished = home?.entry.published?.at;

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
  // The kinds of content with more than one entry, largest first: what the site is made of.
  const collections = byType.filter(({ type }) => type.kind !== 'single' && type.inSettings !== true).sort((a, b) => b.listed.length - a.listed.length);

  return (
    <>
      {/* Home has no header in the bar: it opens on this greeting, the one large line of the editor. */}
      <Welcome
        eyebrow={new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        title={isCounted ? messages.home.headline(greeting, waiting) : greeting}
        {...(isCounted && waiting > 0 && { highlight: messages.home.waitingCount(waiting) })}
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
      <Box paddingX={12} paddingY={8}>
        <Stack gap={6}>
          {failed && <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />}
          {!failed && pending && <LoadingState shape="summary" />}
          {isCounted && (
            <>
              <Grid columns={3} gap={4}>
                <Stat label={messages.home.published} value={number(count((state) => state === 'published' || state === 'unpublishedChanges'))} detail={messages.home.publishedDetail} />
                <Stat label={messages.home.drafts} value={number(count((state) => state === 'draft'))} detail={messages.home.draftsDetail} />
                <Stat label={messages.home.changed} value={number(count((state) => state === 'unpublishedChanges'))} detail={messages.home.changedDetail} />
              </Grid>
              <Grid columns={readsContacts ? 2 : 1} gap={4}>
                <Card title={messages.home.byTypeTitle} description={messages.home.byTypeHelp}>
                  {collections.length === 0 ? (
                    <Text size="sm" tone="muted">
                      {messages.home.byTypeEmpty}
                    </Text>
                  ) : (
                    <BarChart
                      label={messages.home.byTypeTitle}
                      layout="rows"
                      bars={collections.map(({ type, listed }) => ({
                        id: type.id,
                        label: localized(type.label, locale),
                        value: listed.length,
                        valueText: messages.contentList.description(listed.length),
                      }))}
                    />
                  )}
                </Card>
                {readsContacts && <SubmissionsByDay />}
              </Grid>
              <Split asideLabel={messages.home.asideLabel} aside={readsContacts ? <Audience /> : null}>
                <Card title={messages.home.recentTitle} isFlush>
                  {rows.length === 0 ? (
                    <EmptyState icon={Inbox} title={messages.home.recentEmpty} description={messages.home.recentEmptyDescription} />
                  ) : (
                    <Table label={messages.home.recentTitle} columns={columns} rows={rows} frame="none" onRowAction={(id) => go(paths.entry(typeOf.get(id) ?? '', id))} />
                  )}
                </Card>
                {session.data && readsContacts && <FollowUps userId={session.data.id} />}
              </Split>
            </>
          )}
        </Stack>
      </Box>
    </>
  );
}

/** A day as `2026-11-21`, by this browser's calendar. */
const dayKey = (at: Date) => `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

/**
 * How many people wrote in each day of the last two weeks, today last. Spam is
 * left out. It reads only when each submission came, and keeps nothing of what they said.
 */
function SubmissionsByDay() {
  const messages = useMessages();
  const locale = useLocale();
  const forms = useForms();
  const lists = useSubmissionLists((forms.data ?? []).map((form) => form.id), forms.isSuccess);
  const failed = forms.isError ? forms : lists.find((list) => list.isError);

  const today = new Date();
  const days = Array.from({ length: DAYS }, (_, back) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DAYS - 1 - back)));
  const perDay = new Map<string, number>(days.map((day) => [dayKey(day), 0]));
  for (const submission of lists.flatMap((list) => list.data?.items ?? [])) {
    if (submission.status === 'spam') continue;
    const key = dayKey(new Date(submission.createdAt));
    const sofar = perDay.get(key);
    if (sofar !== undefined) perDay.set(key, sofar + 1);
  }
  const total = [...perDay.values()].reduce((sum, one) => sum + one, 0);
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const dayFull = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Card title={messages.home.submissionsTitle} description={messages.home.submissionsHelp(total)} actions={<Link href={paths.forms}>{messages.home.allForms}</Link>}>
      {failed ? (
        <ErrorState error={failed.error ?? new Error(messages.app.somethingWentWrong)} onRetry={() => void failed.refetch()} />
      ) : forms.isPending || lists.some((list) => list.isPending) ? (
        <LoadingState shape="summary" />
      ) : (
        <BarChart
          // Home spends its one orange on the greeting, so today is not set apart here.
          label={messages.home.submissionsTitle}
          bars={days.map((day) => {
            const key = dayKey(day);
            const one = perDay.get(key) ?? 0;
            return { id: key, label: dayName.format(day), value: one, valueText: messages.home.submissionsOn(dayFull.format(day), one) };
          })}
        />
      )}
    </Card>
  );
}

/**
 * What came in from visitors, and what it may be worth: the forms with something new, and the
 * pipeline's open deals by stage. Each part shows nothing if it could not be asked for: Home is not lost over it.
 */
function Audience() {
  const messages = useMessages();
  const locale = useLocale();
  const forms = useForms();
  const counts = useSubmissionCountsOf((forms.data ?? []).map((form) => form.id));
  const forecast = useForecast();
  const pipeline = usePipeline();
  const stageName = useStageName();
  const money = useMoney(pipeline.data?.currency ?? forecast.data?.currency);

  const withNew = (forms.data ?? [])
    .map((form, index) => ({ form, fresh: counts[index]?.data?.new ?? 0 }))
    .filter(({ fresh }) => fresh > 0);
  const fresh = withNew.reduce((sum, { fresh: one }) => sum + one, 0);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const openStages = (forecast.data?.stages ?? []).flatMap((total) => {
    const stage = pipeline.data?.stages.find((candidate) => candidate.id === total.stage);
    return stage?.kind === 'open' ? [{ stage, total }] : [];
  });

  return (
    <>
      {forms.isSuccess && counts.every((one) => one.isSuccess) && (
        <Card title={messages.home.inboxTitle} description={withNew.length === 0 ? messages.home.inboxEmpty : messages.home.inboxNew(number(fresh))} actions={<Link href={paths.forms}>{messages.home.allForms}</Link>}>
          {withNew.length === 0 ? undefined : (
            <Stack gap={2}>
              {withNew.map(({ form, fresh: one }) => (
                <Inline key={form.id} justify="between" gap={2}>
                  <Link href={paths.form(form.id)}>{localized(form.label, locale)}</Link>
                  <Tag tone="info">{messages.forms.newCount(one)}</Tag>
                </Inline>
              ))}
            </Stack>
          )}
        </Card>
      )}
      {forecast.isSuccess && pipeline.isSuccess && forecast.data.stages.some((stage) => stage.count > 0) && (
        <Card title={messages.home.pipelineTitle} description={messages.home.pipelineDetail(money(forecast.data.open), money(forecast.data.weighted))} actions={<Link href={paths.deals}>{messages.app.deals}</Link>}>
          <BarChart
            label={messages.home.pipelineTitle}
            layout="rows"
            bars={openStages.map(({ stage, total }) => ({ id: stage.id, label: stageName(stage), value: total.value, valueText: money(total.value) }))}
          />
        </Card>
      )}
    </>
  );
}
