import type { Deal, Pipeline, TeamMember } from '@velocity-astro/cms-core';
import { Button, DateField, Dialog, Form, Grid, NumberField, Select, TextField, toast } from '@velocity-astro/cms-ui';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AdminRequestError } from '../../client/errors.js';
import { useCreateDeal, useDeleteDeal, useUpdateDeal } from '../../client/queries.js';
import { CustomValueFields, useCustomValues } from '../../fields/custom-values.js';
import { ChangedElsewhere } from '../../app/ChangedElsewhere.js';
import { useClosing } from '../../lib/use-closing.js';
import { isConflict, useDraft } from '../../lib/use-draft.js';
import { useMessages } from '../../messages/messages-context.js';
import { useStageName } from '../Contacts/pipeline.js';
import { DealSubjectFields, useDealSubjects } from './deal-subject.js';

const NOBODY = 'nobody';
const NO_PROBLEMS: Readonly<Record<string, string>> = {};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface DealDialogProps {
  /** The deal to change, or left out to add one. */
  readonly deal?: Deal;
  /** Whose deal a new one is, and who looks after it unless someone else is chosen. */
  readonly contact: { readonly id: string; readonly ownerId?: string | undefined };
  readonly pipeline: Pipeline;
  readonly team: readonly TeamMember[];
  readonly onClose: () => void;
}

/** The window a deal is added or changed in, and deleted from. */
export function DealDialog({ deal, contact, pipeline, team, onClose }: DealDialogProps) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const stageName = useStageName();
  const create = useCreateDeal();
  const update = useUpdateDeal();
  const remove = useDeleteDeal();
  // Only what is changed here is held: the rest is the deal as it is now, so what someone else saved meanwhile is kept.
  const draft = useDraft({
    title: deal?.title ?? '',
    about: deal?.about,
    value: deal?.value ?? null,
    stage: deal?.stage ?? pipeline.stages[0]?.id ?? '',
    owner: deal ? (deal.ownerId ?? NOBODY) : (contact.ownerId ?? NOBODY),
    closeOn: deal?.closeOn ?? null,
  });
  const { title, about, value, stage, owner, closeOn } = draft.values;
  const subjects = useDealSubjects();
  const [problems, setProblems] = useState(NO_PROBLEMS);
  const custom = useCustomValues('deal', deal?.data);
  const currency = pipeline.currency ?? 'USD';

  const failed = (error: unknown) => {
    // What was typed stays; each problem goes to the field it names.
    if (error instanceof AdminRequestError) setProblems(Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message])));
    custom.refused(error);
    toast({ title: messages.deals.notSaved, description: isConflict(error) ? messages.app.savedElsewhere : messageOf(error), tone: 'danger' });
  };
  const { changed } = draft;
  const named = { title: messages.deals.name, about: messages.deals.about, value: messages.deals.value(currency), stage: messages.deals.stage, owner: messages.deals.owner, closeOn: messages.deals.closeOn };
  const send = () => {
    if (title.trim() === '') return setProblems({ title: messages.deals.nameNeeded });
    setProblems(NO_PROBLEMS);
    const worth = value ?? 0;
    if (deal) {
      update.mutate(
        {
          id: deal.id,
          // Only what was changed here: a field someone else changed meanwhile is not put back as it was.
          changes: {
            ...('title' in changed && { title }),
            ...('about' in changed && { about: about ?? null }),
            ...('value' in changed && { value: worth }),
            ...('stage' in changed && { stage }),
            ...('owner' in changed && { ownerId: owner === NOBODY ? null : owner }),
            ...('closeOn' in changed && { closeOn }),
            ...custom.toSend(),
            expectedRevision: deal.revision,
          },
        },
        {
          onSuccess: (saved) => {
            toast({ title: messages.deals.saved(saved.title), tone: 'success' });
            close();
          },
          onError: failed,
        },
      );
    } else {
      create.mutate(
        { contactId: contact.id, title, ...(about && { about }), value: worth, stage, ...(owner !== NOBODY && { ownerId: owner }), ...(closeOn !== null && { closeOn }), ...custom.toSend() },
        {
          onSuccess: (saved) => {
            toast({ title: messages.deals.created(saved.title), tone: 'success' });
            close();
          },
          onError: failed,
        },
      );
    }
  };
  const heading = deal ? messages.deals.editTitle(deal.title) : messages.deals.addTitle;
  // Someone who left still looks after the deal until it is given to another.
  const owners = [
    { id: NOBODY, label: messages.contacts.nobody },
    ...team.map((member) => ({ id: member.id, label: member.name })),
    ...(owner !== NOBODY && !team.some((member) => member.id === owner) ? [{ id: owner, label: messages.contacts.someoneWhoLeft }] : []),
  ];

  return (
    <Dialog
      {...dialog}
      title={heading}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          {deal && (
            <Button
              variant="ghost"
              icon={Trash2}
              isPending={remove.isPending}
              onPress={() =>
                remove.mutate(deal.id, {
                  onSuccess: () => {
                    toast({ title: messages.deals.deleted(deal.title), tone: 'success' });
                    close();
                  },
                  onError: (error) => toast({ title: messages.deals.notDeleted, description: messageOf(error), tone: 'danger' }),
                })
              }
            >
              {messages.deals.delete}
            </Button>
          )}
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={create.isPending || update.isPending} onPress={send}>
            {deal ? messages.deals.save : messages.deals.create}
          </Button>
        </>
      }
    >
      <Form label={heading} gap={4} onSubmit={send}>
        <TextField
          label={messages.deals.name}
          placeholder={messages.deals.namePlaceholder}
          value={title}
          onChange={(next) => draft.set('title', next)}
          isRequired
          autoFocus
          autoComplete="off"
          {...(problems['title'] !== undefined && { errorMessage: problems['title'] })}
        />
        <DealSubjectFields
          subjects={subjects}
          about={about}
          problem={problems['about']}
          onChange={(next, name) => {
            draft.set('about', next);
            // A deal with no words of its own yet is called by what it is about.
            if (name !== undefined && title.trim() === '') draft.set('title', name);
          }}
        />
        <Grid columns={2} gap={3}>
          <NumberField label={messages.deals.value(currency)} value={value} onChange={(next) => draft.set('value', next)} minValue={0} isInteger {...(problems['value'] !== undefined && { errorMessage: problems['value'] })} />
          <Select
            label={messages.deals.stage}
            options={pipeline.stages.map((candidate) => ({ id: candidate.id, label: stageName(candidate) }))}
            value={stage}
            onChange={(next) => draft.set('stage', next)}
            {...(problems['stage'] !== undefined && { errorMessage: problems['stage'] })}
          />
          <Select label={messages.deals.owner} options={owners} value={owner} onChange={(next) => draft.set('owner', next)} {...(problems['ownerId'] !== undefined && { errorMessage: problems['ownerId'] })} />
          <DateField label={messages.deals.closeOn} value={closeOn} onChange={(next) => draft.set('closeOn', next)} {...(problems['closeOn'] !== undefined && { errorMessage: problems['closeOn'] })} />
        </Grid>
        <CustomValueFields custom={custom} />
        <ChangedElsewhere names={draft.clashes.map((key) => named[key])} />
      </Form>
    </Dialog>
  );
}
