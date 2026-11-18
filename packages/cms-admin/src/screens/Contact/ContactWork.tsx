import type { Contact, ContactChanges } from '@velocity/cms-core';
import { Card, DateField, Select, Stack, toast } from '@velocity/cms-ui';
import { useState } from 'react';
import { usePipeline, useTeam, useUpdateContact } from '../../client/queries.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { dayText, useStageName } from '../Contacts/pipeline.js';

const NOBODY = 'nobody';
/** No follow-up is planned for before this: an earlier day is a year still being typed. */
const FIRST_DAY = '2000-01-01';
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Where a contact stands, who looks after them and when to get back to them. Each choice is saved as it is made. */
export function ContactWork({ contact }: { readonly contact: Contact }) {
  const messages = useMessages();
  const locale = useLocale();
  const pipeline = usePipeline();
  const team = useTeam();
  const update = useUpdateContact();
  const stageName = useStageName();
  // A day is held here while it is typed: a year is typed a digit at a time, and only a whole one is saved.
  const [day, setDay] = useState<string | null>(contact.followUpAt ?? null);

  const save = (changes: Omit<ContactChanges, 'expectedRevision'>, done: string) =>
    update.mutate(
      { id: contact.id, changes: { ...changes, expectedRevision: contact.revision } },
      {
        onSuccess: () => toast({ title: done, tone: 'success' }),
        onError: (error) => toast({ title: messages.contacts.notChanged, description: messageOf(error), tone: 'danger' }),
      },
    );
  const stages = pipeline.data?.stages ?? [];
  const members = team.data ?? [];
  // Someone who left still looks after the contact until it is given to another.
  const owners = [
    { id: NOBODY, label: messages.contacts.nobody },
    ...members.map((member) => ({ id: member.id, label: member.name })),
    ...(contact.ownerId !== undefined && team.isSuccess && !members.some((member) => member.id === contact.ownerId) ? [{ id: contact.ownerId, label: messages.contacts.someoneWhoLeft }] : []),
  ];

  return (
    <Card title={messages.contacts.work}>
      <Stack gap={4}>
        <Select
          label={messages.contacts.stage}
          options={stages.map((stage) => ({ id: stage.id, label: stageName(stage) }))}
          value={contact.stage}
          isDisabled={update.isPending || !pipeline.isSuccess}
          onChange={(stage) => stage !== contact.stage && save({ stage }, messages.contacts.stageSaved(stageName(stages.find((candidate) => candidate.id === stage))))}
        />
        <Select
          label={messages.contacts.owner}
          options={owners}
          value={contact.ownerId ?? NOBODY}
          isDisabled={update.isPending || !team.isSuccess}
          onChange={(owner) => {
            if (owner === (contact.ownerId ?? NOBODY)) return;
            if (owner === NOBODY) save({ ownerId: null }, messages.contacts.ownerCleared);
            else save({ ownerId: owner }, messages.contacts.ownerSaved(members.find((member) => member.id === owner)?.name ?? ''));
          }}
        />
        <DateField
          label={messages.contacts.followUp}
          description={messages.contacts.followUpHelp}
          value={day}
          isDisabled={update.isPending}
          onChange={(next) => {
            setDay(next);
            if (next === (contact.followUpAt ?? null)) return;
            if (next === null) save({ followUpAt: null }, messages.contacts.followUpCleared);
            else if (next >= FIRST_DAY) save({ followUpAt: next }, messages.contacts.followUpSaved(dayText(next, locale)));
          }}
        />
      </Stack>
    </Card>
  );
}
