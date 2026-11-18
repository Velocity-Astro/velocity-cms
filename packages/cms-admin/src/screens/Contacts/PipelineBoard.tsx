import type { Contact, Pipeline, TeamMember } from '@velocity-astro/cms-core';
import { Board, toast, type BoardColumn } from '@velocity-astro/cms-ui';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { paths } from '../../app/paths.js';
import { useGo } from '../../app/use-go.js';
import type { ContactListQuery } from '../../client/admin-client.js';
import { useContactLists, useMoveContact } from '../../client/queries.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { STAGE_TONE, useFollowUp, useOwnerName, useStageName } from './pipeline.js';

/** As many cards as a column shows. The rest are counted, and found in the list. */
const COLUMN = 50;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface PipelineBoardProps {
  readonly pipeline: Pipeline;
  readonly team: readonly TeamMember[] | undefined;
  /** What narrows the board: the words searched for and who looks after the contacts. */
  readonly filter: Pick<ContactListQuery, 'search' | 'ownerId'>;
}

/** The contacts by stage, each a card that is dragged, or moved from its menu, to another stage. */
export function PipelineBoard({ pipeline, team, filter }: PipelineBoardProps) {
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const stageName = useStageName();
  const ownerName = useOwnerName(team);
  const followUp = useFollowUp();
  const lists = useContactLists(pipeline.stages.map((stage) => ({ ...filter, stage: stage.id, limit: COLUMN })));
  const move = useMoveContact();

  const failed = lists.find((list) => list.isError);
  if (failed) return <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  if (lists.some((list) => list.isPending)) return <LoadingState shape="summary" />;

  // A card that was just moved is shown where it was put, until the lists say so themselves.
  const moving = move.isPending ? move.variables : undefined;
  const byId = new Map<string, Contact>();
  const columns: BoardColumn[] = pipeline.stages.map((stage, index) => {
    const page = lists[index]?.data ?? { items: [], total: 0 };
    let items = page.items;
    let total = page.total;
    if (moving) {
      const held = items.some((contact) => contact.id === moving.contact.id);
      if (stage.id === moving.stage && !held) {
        items = [{ ...moving.contact, stage: stage.id }, ...items];
        total += 1;
      } else if (stage.id !== moving.stage && held) {
        items = items.filter((contact) => contact.id !== moving.contact.id);
        total -= 1;
      }
    }
    for (const contact of items) byId.set(contact.id, contact);
    return {
      id: stage.id,
      title: stageName(stage),
      count: new Intl.NumberFormat(locale).format(total),
      tone: STAGE_TONE[stage.kind],
      items: items.map((contact) => ({
        id: contact.id,
        title: contact.name ?? contact.email,
        ...(contact.name !== undefined && { detail: contact.email }),
        notes: [
          ...(contact.ownerId !== undefined && ownerName(contact.ownerId) !== '' ? [{ text: ownerName(contact.ownerId) }] : []),
          ...(contact.followUpAt !== undefined ? [followUp(contact.followUpAt)] : []),
        ],
      })),
      ...(total > items.length && { more: messages.contacts.boardMore(total - items.length) }),
    };
  });

  return (
    <Board
      label={messages.contacts.board}
      columns={columns}
      emptyText={messages.contacts.boardEmpty}
      onOpen={(id) => go(paths.contact(id))}
      moveLabel={messages.contacts.move}
      onMove={(id, stageId) => {
        const contact = byId.get(id);
        if (!contact || move.isPending) return;
        move.mutate(
          { contact, stage: stageId },
          {
            onSuccess: () => toast({ title: messages.contacts.moved(contact.name ?? contact.email, stageName(pipeline.stages.find((stage) => stage.id === stageId))), tone: 'success' }),
            onError: (error) => toast({ title: messages.contacts.notMoved, description: messageOf(error), tone: 'danger' }),
          },
        );
      }}
    />
  );
}
