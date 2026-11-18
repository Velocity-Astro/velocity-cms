import { Heading, Inline, Link, Stack, Table, Tag, Text, type TableColumn, type TableRow } from '@velocity/cms-ui';
import { paths } from '../../app/paths.js';
import { useGo } from '../../app/use-go.js';
import { useContacts, usePipeline } from '../../client/queries.js';
import { useMessages } from '../../messages/messages-context.js';
import { STAGE_TONE, today, useFollowUp, useStageName } from '../Contacts/pipeline.js';

/** How many are listed. The rest are counted, and found under Contacts. */
const SHOWN = 5;

/**
 * The contacts the person looks after that are due today or overdue, soonest first. It shows
 * nothing while there are none, and nothing if they could not be asked for: Home is not lost over it.
 */
export function FollowUps({ userId }: { readonly userId: string }) {
  const messages = useMessages();
  const go = useGo();
  const due = useContacts({ ownerId: userId, followUpBy: today(), limit: SHOWN });
  const pipeline = usePipeline();
  const stageName = useStageName();
  const followUp = useFollowUp();
  if (!due.isSuccess || due.data.total === 0) return null;

  const columns: TableColumn[] = [
    { id: 'name', label: messages.contacts.columnName },
    { id: 'stage', label: messages.contacts.columnStage },
    { id: 'due', label: messages.contacts.columnFollowUp, align: 'end' },
  ];
  const rows: TableRow[] = due.data.items.map((contact) => {
    const stage = pipeline.data?.stages.find((candidate) => candidate.id === contact.stage);
    const when = followUp(contact.followUpAt ?? '');
    return {
      id: contact.id,
      cells: {
        name: <Text weight="semibold">{contact.name ?? contact.email}</Text>,
        stage: stage ? <Tag tone={STAGE_TONE[stage.kind]}>{stageName(stage)}</Tag> : '',
        due: <Tag tone={when.tone}>{when.text}</Tag>,
      },
    };
  });
  const more = due.data.total - due.data.items.length;

  return (
    <Stack gap={3}>
      <Stack gap={1}>
        <Heading level={2}>{messages.home.followUpsTitle}</Heading>
        <Text size="sm" tone="muted">
          {messages.home.followUpsHelp}
        </Text>
      </Stack>
      <Table label={messages.home.followUpsTitle} columns={columns} rows={rows} onRowAction={(id) => go(paths.contact(id))} />
      <Inline gap={2}>
        {more > 0 && (
          <Text size="sm" tone="muted">
            {messages.home.followUpsMore(more)}
          </Text>
        )}
        <Link href={paths.contacts}>{messages.home.allContacts}</Link>
      </Inline>
    </Stack>
  );
}
