import type { Contact, TimelineItem } from '@velocity/cms-core';
import { Box, Button, Card, ConfirmDialog, Dialog, EmptyState, Form, Inline, Link, PageHeader, Split, Stack, Tag, Text, TextArea, TextField, toast } from '@velocity/cms-ui';
import { Contact as ContactIcon, Download, Pencil, UserX } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { paths } from '../../app/paths.js';
import { useGo } from '../../app/use-go.js';
import { AdminRequestError } from '../../client/errors.js';
import { useAddContactNote, useContact, useContactTimeline, useDeleteContactNote, useEraseContact, useExportContact, useForms, useSession, useUpdateContact } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { downloadText } from '../../lib/download.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useClosing } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { useSourceOf } from '../Contacts/contact-source.js';
import { answerText } from '../Form/form-fields.js';

const NO_PROBLEMS: Readonly<Record<string, string>> = {};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One contact: who they are, what they sent and what the team noted. */
export function ContactScreen() {
  const { contactId = '' } = useParams();
  const messages = useMessages();
  const session = useSession();
  const mayRead = session.data !== null && session.data !== undefined && session.data.role !== 'author';
  if (!mayRead) return <EmptyState icon={ContactIcon} title={messages.contacts.title} description={messages.contacts.noAccess} />;
  // Made anew for each contact, so a note half written for one is never left open on another.
  return <ContactParts key={contactId} id={contactId} />;
}

function ContactParts({ id }: { readonly id: string }) {
  const messages = useMessages();
  const contact = useContact(id);

  if (contact.isPending) return <LoadingState />;
  if (contact.isError) {
    if (contact.error instanceof AdminRequestError && contact.error.code === 'not_found') {
      return (
        <EmptyState
          icon={ContactIcon}
          title={messages.contacts.notFoundTitle}
          description={messages.contacts.notFoundDescription}
          action={<Link href={paths.contacts}>{messages.contacts.backToContacts}</Link>}
        />
      );
    }
    return <ErrorState error={contact.error} onRetry={() => void contact.refetch()} />;
  }
  return <ContactPage contact={contact.data} />;
}

function ContactPage({ contact }: { readonly contact: Contact }) {
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const forms = useForms();
  const sourceOf = useSourceOf(forms.data);
  const exportFile = useExportContact();
  const erase = useEraseContact();
  const [isEditing, setEditing] = useState(false);
  const [isErasing, setErasing] = useState(false);
  const name = contact.name ?? contact.email;
  const facts = [
    [messages.contacts.email, contact.email],
    [messages.contacts.phone, contact.phone ?? messages.contacts.notGiven],
    [messages.contacts.firstCameFrom, sourceOf(contact)],
    [messages.contacts.added, relativeTime(contact.createdAt, locale)],
  ] as const;

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <Stack gap={2}>
          <Link href={paths.contacts}>{messages.contacts.backToContacts}</Link>
          <PageHeader
            title={name}
            {...(contact.name !== undefined && { description: contact.email })}
            actions={
              <Inline gap={2}>
                <Button variant="ghost" icon={UserX} onPress={() => setErasing(true)}>
                  {messages.contacts.erase}
                </Button>
                <Button
                  variant="secondary"
                  icon={Download}
                  isPending={exportFile.isPending}
                  onPress={() =>
                    exportFile.mutate(contact.id, {
                      onSuccess: (file) => {
                        downloadText(`contact-${contact.email}.json`, file, 'application/json;charset=utf-8');
                        toast({ title: messages.contacts.exported, description: messages.contacts.exportedDescription, tone: 'success' });
                      },
                      onError: (error) => toast({ title: messages.contacts.notExported, description: messageOf(error), tone: 'danger' }),
                    })
                  }
                >
                  {messages.contacts.export}
                </Button>
                <Button icon={Pencil} onPress={() => setEditing(true)}>
                  {messages.contacts.edit}
                </Button>
              </Inline>
            }
          />
        </Stack>
        <Split
          asideLabel={messages.contacts.detailsLabel}
          aside={
            <Card title={messages.contacts.details}>
              <Stack gap={4}>
                {facts.map(([label, value]) => (
                  <Stack key={label} gap={0}>
                    <Text size="sm" weight="semibold" tone="secondary">
                      {label}
                    </Text>
                    <Text>{value}</Text>
                  </Stack>
                ))}
              </Stack>
            </Card>
          }
        >
          <Timeline contact={contact} />
        </Split>
      </Stack>
      {isEditing && <EditContactDialog contact={contact} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        isOpen={isErasing}
        onOpenChange={setErasing}
        title={messages.contacts.eraseTitle(name)}
        confirmLabel={messages.contacts.eraseConfirm}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={erase.isPending}
        onConfirm={() =>
          erase.mutate(contact.id, {
            onSuccess: (count) => {
              toast({ title: messages.contacts.erased(name, count), tone: 'success' });
              go(paths.contacts);
            },
            onError: (error) => {
              toast({ title: messages.contacts.notErased, description: messageOf(error), tone: 'danger' });
              setErasing(false);
            },
          })
        }
      >
        {messages.contacts.eraseDescription}
      </ConfirmDialog>
    </Box>
  );
}

/** What happened with a contact, newest first, under the place a note is written. */
function Timeline({ contact }: { readonly contact: Contact }) {
  const messages = useMessages();
  const locale = useLocale();
  const timeline = useContactTimeline(contact.id);
  const addNote = useAddContactNote();
  const deleteNote = useDeleteContactNote();
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const add = () => {
    setProblem(null);
    addNote.mutate(
      { id: contact.id, text: note },
      {
        onSuccess: () => {
          setNote('');
          toast({ title: messages.contacts.noteAdded, tone: 'success' });
        },
        onError: (error) => {
          // What was typed stays in the box.
          if (error instanceof AdminRequestError && error.code === 'validation_failed') setProblem(error.issues[0]?.message ?? error.message);
          toast({ title: messages.contacts.noteNotAdded, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };
  const lines = (text: string) => text.split('\n').map((line, index) => <Text key={index}>{line}</Text>);
  const item = (entry: TimelineItem) =>
    entry.kind === 'note' ? (
      <Stack key={entry.note.id} gap={2}>
        <Inline gap={2} justify="between">
          <Inline gap={2}>
            <Tag>{messages.contacts.noteLabel}</Tag>
            <Text size="sm" tone="muted">
              {relativeTime(entry.at, locale)}
            </Text>
          </Inline>
          <Button
            variant="ghost"
            size="sm"
            isPending={deleteNote.isPending && deleteNote.variables.noteId === entry.note.id}
            onPress={() =>
              deleteNote.mutate(
                { id: contact.id, noteId: entry.note.id },
                {
                  onSuccess: () => toast({ title: messages.contacts.noteDeleted, tone: 'success' }),
                  onError: (error) => toast({ title: messages.contacts.noteNotDeleted, description: messageOf(error), tone: 'danger' }),
                },
              )
            }
          >
            {messages.contacts.deleteNote}
          </Button>
        </Inline>
        {/* As text, a line at a time. */}
        <Stack gap={0}>{lines(entry.note.text)}</Stack>
      </Stack>
    ) : (
      <Stack key={entry.submission.id} gap={3}>
        <Stack gap={0}>
          <Inline gap={2}>
            <Tag tone="info">{entry.formLabel ? messages.contacts.sent(localized(entry.formLabel, locale)) : messages.contacts.sentUnknown}</Tag>
            <Text size="sm" tone="muted">
              {relativeTime(entry.at, locale)}
            </Text>
          </Inline>
          {entry.submission.page !== undefined && (
            <Text size="sm" tone="muted">
              {messages.contacts.fromPage(entry.submission.page)}
            </Text>
          )}
        </Stack>
        {entry.answers.map((answer) => (
          <Stack key={answer.key} gap={0}>
            <Text size="sm" weight="semibold" tone="secondary">
              {localized(answer.label, locale)}
            </Text>
            {/* As text, a line at a time: what a visitor wrote is never markup here. */}
            {lines(answerText(answer.value, messages.forms.yes))}
          </Stack>
        ))}
      </Stack>
    );

  return (
    <Stack gap={6}>
      <Card title={messages.contacts.note}>
        <Form label={messages.contacts.note} gap={3} onSubmit={add}>
          <TextArea
            label={messages.contacts.note}
            isLabelHidden
            description={messages.contacts.noteHelp}
            placeholder={messages.contacts.notePlaceholder}
            value={note}
            onChange={setNote}
            {...(problem !== null && { errorMessage: problem })}
          />
          <Inline justify="end">
            <Button variant="secondary" isPending={addNote.isPending} isDisabled={note.trim() === ''} onPress={add}>
              {messages.contacts.addNote}
            </Button>
          </Inline>
        </Form>
      </Card>
      <Card title={messages.contacts.timeline} description={messages.contacts.timelineHelp}>
        {timeline.isPending && <LoadingState shape="summary" />}
        {timeline.isError && <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />}
        {timeline.isSuccess && timeline.data.length === 0 && <Text tone="muted">{messages.contacts.timelineEmpty}</Text>}
        {timeline.isSuccess && timeline.data.length > 0 && <Stack gap={6}>{timeline.data.map(item)}</Stack>}
      </Card>
    </Stack>
  );
}

/** The window a contact's details are changed in. A problem the server finds goes to the field it names. */
function EditContactDialog({ contact, onClose }: { readonly contact: Contact; readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const update = useUpdateContact();
  const [name, setName] = useState(contact.name ?? '');
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [problems, setProblems] = useState(NO_PROBLEMS);

  const send = () => {
    if (email.trim() === '') return setProblems({ email: messages.contacts.emailNeeded });
    setProblems(NO_PROBLEMS);
    update.mutate(
      { id: contact.id, changes: { email, name: name.trim() === '' ? null : name, phone: phone.trim() === '' ? null : phone, expectedRevision: contact.revision } },
      {
        onSuccess: (saved) => {
          toast({ title: messages.contacts.saved(saved.name ?? saved.email), tone: 'success' });
          close();
        },
        onError: (error) => {
          if (error instanceof AdminRequestError) setProblems(Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message])));
          toast({ title: messages.contacts.notSaved, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  return (
    <Dialog
      {...dialog}
      title={messages.contacts.editTitle(contact.name ?? contact.email)}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={update.isPending} onPress={send}>
            {messages.contacts.save}
          </Button>
        </>
      }
    >
      <Form label={messages.contacts.editTitle(contact.name ?? contact.email)} gap={4} onSubmit={send}>
        <TextField label={messages.contacts.name} value={name} onChange={setName} autoFocus autoComplete="off" {...(problems['name'] !== undefined && { errorMessage: problems['name'] })} />
        <TextField label={messages.contacts.email} type="email" value={email} onChange={setEmail} isRequired autoComplete="off" {...(problems['email'] !== undefined && { errorMessage: problems['email'] })} />
        <TextField label={messages.contacts.phone} type="tel" value={phone} onChange={setPhone} autoComplete="off" {...(problems['phone'] !== undefined && { errorMessage: problems['phone'] })} />
      </Form>
    </Dialog>
  );
}
