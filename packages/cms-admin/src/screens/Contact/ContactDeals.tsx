import type { Contact, Deal } from '@velocity-astro/cms-core';
import { Button, Card, Inline, Stack, Table, Tag, Text, type TableColumn, type TableRow } from '@velocity-astro/cms-ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useDeals, usePipeline, useTeam } from '../../client/queries.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { STAGE_TONE, dayText, useMoney, useStageName } from '../Contacts/pipeline.js';
import { DealDialog } from '../Deals/DealDialog.js';

/** What a contact may buy: each deal with its stage and worth, opened to change it, and a way to add one. */
export function ContactDeals({ contact }: { readonly contact: Contact }) {
  const messages = useMessages();
  const locale = useLocale();
  const deals = useDeals({ contactId: contact.id, limit: 200 });
  const pipeline = usePipeline();
  const team = useTeam();
  const stageName = useStageName();
  const money = useMoney(pipeline.data?.currency);
  // `null` while the window is shut, `'new'` to add a deal, or the deal being changed.
  const [open, setOpen] = useState<Deal | 'new' | null>(null);

  const columns: TableColumn[] = [
    { id: 'title', label: messages.deals.columnTitle },
    { id: 'stage', label: messages.deals.columnStage },
    { id: 'close', label: messages.deals.columnClose, isSecondary: true },
    { id: 'value', label: messages.deals.columnValue, align: 'end' },
  ];
  const rows: TableRow[] = (deals.data?.items ?? []).map((deal) => {
    const stage = pipeline.data?.stages.find((candidate) => candidate.id === deal.stage);
    return {
      id: deal.id,
      cells: {
        title: <Text weight="semibold">{deal.title}</Text>,
        stage: stage ? <Tag tone={STAGE_TONE[stage.kind]}>{stageName(stage)}</Tag> : '',
        close: <Text tone="secondary">{deal.closeOn === undefined ? '' : dayText(deal.closeOn, locale)}</Text>,
        value: <Text weight="semibold">{money(deal.value)}</Text>,
      },
    };
  });

  return (
    <Card title={messages.deals.cardTitle}>
      <Stack gap={4}>
        {deals.isPending && <LoadingState shape="table" />}
        {deals.isError && <ErrorState error={deals.error} onRetry={() => void deals.refetch()} />}
        {deals.isSuccess && rows.length === 0 && <Text tone="muted">{messages.deals.cardEmpty}</Text>}
        {deals.isSuccess && rows.length > 0 && (
          <Table label={messages.deals.cardTitle} columns={columns} rows={rows} onRowAction={(id) => setOpen(deals.data.items.find((deal) => deal.id === id) ?? null)} />
        )}
        <Inline>
          <Button variant="secondary" size="sm" icon={Plus} isDisabled={!pipeline.isSuccess} onPress={() => setOpen('new')}>
            {messages.deals.add}
          </Button>
        </Inline>
      </Stack>
      {/* Made anew each time it opens, so it never shows what was typed last time. */}
      {open !== null && pipeline.data && (
        <DealDialog {...(open !== 'new' && { deal: deals.data?.items.find((deal) => deal.id === open.id) ?? open })} contact={contact} pipeline={pipeline.data} team={team.data ?? []} onClose={() => setOpen(null)} />
      )}
    </Card>
  );
}
