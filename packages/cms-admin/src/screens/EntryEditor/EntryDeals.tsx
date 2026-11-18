import type { ContentTypeDef, Deal, Entry } from '@velocity-astro/cms-core';
import { Card, Stack, Table, Tag, Text, type TableColumn, type TableRow } from '@velocity-astro/cms-ui';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useDeals, usePipeline, useSession, useTeam } from '../../client/queries.js';
import { useMessages } from '../../messages/messages-context.js';
import { STAGE_TONE, useMoney, useStageName } from '../Contacts/pipeline.js';
import { DealDialog } from '../Deals/DealDialog.js';

/**
 * The deals about an entry, for a content type that takes deals. Deals are as personal as
 * contacts, so the card is there only for those who may read them, and nothing is asked for
 * otherwise.
 */
export function EntryDeals({ type, entry }: { readonly type: ContentTypeDef; readonly entry: Entry | null }) {
  const session = useSession();
  const mayRead = session.data !== null && session.data !== undefined && session.data.role !== 'author';
  if (type.forDeals !== true || entry === null || !mayRead) return null;
  return <DealsAbout typeId={type.id} entry={entry.translationGroup} />;
}

function DealsAbout({ typeId, entry }: { readonly typeId: string; readonly entry: string }) {
  const messages = useMessages();
  const deals = useDeals({ about: { typeId, entry }, limit: 200 });
  const pipeline = usePipeline();
  const team = useTeam();
  const stageName = useStageName();
  const money = useMoney(pipeline.data?.currency);
  const [open, setOpen] = useState<Deal | null>(null);

  const columns: TableColumn[] = [
    { id: 'title', label: messages.deals.columnTitle },
    { id: 'value', label: messages.deals.columnValue, align: 'end' },
  ];
  const rows: TableRow[] = (deals.data?.items ?? []).map((deal) => {
    const stage = pipeline.data?.stages.find((candidate) => candidate.id === deal.stage);
    return {
      id: deal.id,
      cells: {
        title: (
          <Stack gap={1}>
            <Text weight="semibold">{deal.title}</Text>
            {stage && <Tag tone={STAGE_TONE[stage.kind]}>{stageName(stage)}</Tag>}
          </Stack>
        ),
        value: <Text weight="semibold">{money(deal.value)}</Text>,
      },
    };
  });

  return (
    <Card title={messages.deals.entryDeals}>
      {deals.isPending && <LoadingState shape="table" />}
      {deals.isError && <ErrorState error={deals.error} onRetry={() => void deals.refetch()} />}
      {deals.isSuccess && rows.length === 0 && <Text tone="muted">{messages.deals.entryCardEmpty}</Text>}
      {deals.isSuccess && rows.length > 0 && (
        <Table label={messages.deals.entryDeals} columns={columns} rows={rows} onRowAction={(id) => setOpen(deals.data.items.find((deal) => deal.id === id) ?? null)} />
      )}
      {/* Made anew each time it opens, so it never shows what was typed last time. */}
      {open !== null && pipeline.data && <DealDialog deal={open} contact={{ id: open.contactId }} pipeline={pipeline.data} team={team.data ?? []} onClose={() => setOpen(null)} />}
    </Card>
  );
}
