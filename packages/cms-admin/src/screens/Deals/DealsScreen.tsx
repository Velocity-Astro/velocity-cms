import type { Deal, Pipeline } from '@velocity/cms-core';
import { Board, Box, Button, EmptyState, Grid, Link, PageHeader, Stack, Stat, toast, type BoardColumn } from '@velocity/cms-ui';
import { HandCoins, ListPlus } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { paths } from '../../app/paths.js';
import { useContacts, useDealLists, useForecast, usePipeline, useSession, useTeam, useUpdateDeal } from '../../client/queries.js';
import { CustomFieldsDialog } from '../../fields/CustomFieldsDialog.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { STAGE_TONE, dayText, useMoney, useStageName } from '../Contacts/pipeline.js';
import { DealDialog } from './DealDialog.js';
import { useDealSubjects } from './deal-subject.js';

/** As many cards as a column shows. The rest are counted in the column's worth. */
const COLUMN = 50;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Every deal by stage, with what is open, what it is likely to bring and what was won. */
export function DealsScreen() {
  const messages = useMessages();
  const session = useSession();
  const pipeline = usePipeline();
  const [isEditingFields, setEditingFields] = useState(false);
  const mayRead = session.data !== null && session.data !== undefined && session.data.role !== 'author';
  // Deals are as personal as contacts: an author who finds the address is told so, and nothing is asked for.
  if (!mayRead) return <EmptyState icon={HandCoins} title={messages.deals.title} description={messages.deals.noAccess} />;
  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader
          title={messages.deals.title}
          description={messages.deals.description}
          actions={
            <Button variant="secondary" icon={ListPlus} onPress={() => setEditingFields(true)}>
              {messages.customFields.button}
            </Button>
          }
        />
        {pipeline.isPending && <LoadingState shape="summary" />}
        {pipeline.isError && <ErrorState error={pipeline.error} onRetry={() => void pipeline.refetch()} />}
        {pipeline.isSuccess && <DealBoard pipeline={pipeline.data} />}
      </Stack>
      {isEditingFields && <CustomFieldsDialog of="deal" onClose={() => setEditingFields(false)} />}
    </Box>
  );
}

function DealBoard({ pipeline }: { readonly pipeline: Pipeline }) {
  const messages = useMessages();
  const locale = useLocale();
  const stageName = useStageName();
  const money = useMoney(pipeline.currency);
  const forecast = useForecast();
  const team = useTeam();
  // Whose deal each is, by name. A site with more contacts than this shows the rest without one.
  const contacts = useContacts({ limit: 200 });
  const lists = useDealLists(pipeline.stages.map((stage) => ({ stage: stage.id, limit: COLUMN })));
  const subjects = useDealSubjects();
  const move = useUpdateDeal();
  const [open, setOpen] = useState<Deal | null>(null);

  const failed = lists.find((list) => list.isError);
  if (failed) return <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  if (forecast.isError) return <ErrorState error={forecast.error} onRetry={() => void forecast.refetch()} />;
  if (forecast.isPending || lists.some((list) => list.isPending)) return <LoadingState shape="summary" />;
  const standing = forecast.data;

  const total = standing.stages.reduce((sum, stage) => sum + stage.count, 0);
  if (total === 0) {
    return <EmptyState icon={HandCoins} title={messages.deals.emptyTitle} description={messages.deals.emptyDescription} action={<Link href={paths.contacts}>{messages.deals.toContacts}</Link>} />;
  }

  const nameOf = new Map((contacts.data?.items ?? []).map((contact) => [contact.id, contact.name ?? contact.email]));
  // A card that was just moved is shown where it was put, until the lists say so themselves.
  const moving = move.isPending && move.variables.changes.stage !== undefined ? { id: move.variables.id, stage: move.variables.changes.stage } : undefined;
  const all = lists.flatMap((list) => list.data?.items ?? []);
  const byId = new Map(all.map((deal) => [deal.id, deal]));
  const columns: BoardColumn[] = pipeline.stages.map((stage, index) => {
    const listed = lists[index]?.data?.items ?? [];
    const held = moving ? listed.filter((deal) => deal.id !== moving.id) : listed;
    const arriving = moving && moving.stage === stage.id ? byId.get(moving.id) : undefined;
    const items = arriving ? [arriving, ...held] : held;
    const totals = standing.stages.find((candidate) => candidate.stage === stage.id);
    const count = totals?.count ?? 0;
    return {
      id: stage.id,
      title: stageName(stage),
      count: money(totals?.value ?? 0),
      tone: STAGE_TONE[stage.kind],
      items: items.map((deal) => {
        const who = nameOf.get(deal.contactId);
        const subject = subjects.nameOf(deal.about);
        return {
          id: deal.id,
          title: deal.title,
          ...(who !== undefined && { detail: who }),
          notes: [{ text: money(deal.value) }, ...(subject !== undefined && subject !== deal.title ? [{ text: subject }] : []), ...(deal.closeOn !== undefined && stage.kind === 'open' ? [{ text: messages.deals.closes(dayText(deal.closeOn, locale)) }] : [])],
        };
      }),
      ...(count > listed.length && { more: messages.deals.boardMore(count - listed.length) }),
    };
  });

  return (
    <>
      <Grid columns={3} gap={4}>
        <Stat label={messages.deals.open} value={money(standing.open)} detail={messages.deals.openDetail} />
        <Stat label={messages.deals.forecast} value={money(standing.weighted)} detail={messages.deals.forecastDetail} />
        <Stat label={messages.deals.won} value={money(standing.won)} detail={messages.deals.wonDetail} />
      </Grid>
      <Board
        label={messages.deals.board}
        columns={columns}
        emptyText={messages.deals.boardEmpty}
        onOpen={(id) => setOpen(byId.get(id) ?? null)}
        moveLabel={messages.deals.move}
        onMove={(id, stageId) => {
          const deal = byId.get(id);
          if (!deal || move.isPending) return;
          move.mutate(
            { id, changes: { stage: stageId, expectedRevision: deal.revision } },
            {
              onSuccess: () => toast({ title: messages.deals.moved(deal.title, stageName(pipeline.stages.find((stage) => stage.id === stageId))), tone: 'success' }),
              onError: (error) => toast({ title: messages.deals.notMoved, description: messageOf(error), tone: 'danger' }),
            },
          );
        }}
      />
      {open && <DealDialog deal={open} contact={{ id: open.contactId }} pipeline={pipeline} team={team.data ?? []} onClose={() => setOpen(null)} />}
    </>
  );
}
