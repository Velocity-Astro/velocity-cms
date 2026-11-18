import type { FormDef, Submission, SubmissionStatus } from '@velocity/cms-core';
import { Button, ConfirmDialog, Dialog, EmptyState, Inline, Segmented, Stack, Table, Text, toast, type TableColumn, type TableRow } from '@velocity/cms-ui';
import { Download, Inbox } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useDeleteSubmission, useExportSubmissions, useMarkSubmission, useSubmissionCounts, useSubmissions } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { downloadText } from '../../lib/download.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useClosing } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { answerText } from './form-fields.js';

const STATUSES: readonly SubmissionStatus[] = ['new', 'handled', 'spam'];
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What visitors sent through a form: new first, then what was handled and what looked like spam. */
export function Submissions({ form }: { readonly form: FormDef }) {
  const messages = useMessages();
  const locale = useLocale();
  const [status, setStatus] = useState<SubmissionStatus>('new');
  const submissions = useSubmissions({ formId: form.id, status, limit: 200 });
  const counts = useSubmissionCounts(form.id);
  const exportFile = useExportSubmissions();
  const [openId, setOpenId] = useState<string | null>(null);
  const name = localized(form.label, locale);
  const opened = submissions.data?.items.find((submission) => submission.id === openId);

  const text = (submission: Submission, fieldId: string | undefined) => (fieldId === undefined ? '' : answerText(submission.data[fieldId], messages.forms.yes));
  const senderOf = (submission: Submission) => text(submission, form.contact?.name) || submission.email || messages.forms.unknownSender;
  // The longest thing they wrote says most about why they wrote.
  const summaryOf = (submission: Submission) =>
    Object.entries(submission.data)
      .filter(([id]) => id !== form.contact?.name && id !== form.contact?.email && id !== form.contact?.phone)
      .map(([, value]) => answerText(value, messages.forms.yes))
      .sort((a, b) => b.length - a.length)[0] ?? '';

  const columns: TableColumn[] = [
    { id: 'from', label: messages.forms.columnFrom },
    { id: 'summary', label: messages.forms.columnSummary },
    { id: 'received', label: messages.forms.columnReceived, align: 'end' },
  ];
  const rows: TableRow[] = (submissions.data?.items ?? []).map((submission) => {
    const sender = senderOf(submission);
    return {
      id: submission.id,
      cells: {
        from: (
          <Stack gap={0}>
            <Text weight="semibold">{sender}</Text>
            {submission.email !== undefined && submission.email !== sender && (
              <Text size="sm" tone="muted">
                {submission.email}
              </Text>
            )}
          </Stack>
        ),
        summary: (
          <Text tone="secondary" truncate>
            {summaryOf(submission).slice(0, 120)}
          </Text>
        ),
        received: (
          <Text size="sm" tone="muted">
            {relativeTime(submission.createdAt, locale)}
          </Text>
        ),
      },
    };
  });
  const empty = {
    new: [messages.forms.emptyNewTitle, messages.forms.emptyNewDescription],
    handled: [messages.forms.emptyHandledTitle, messages.forms.emptyHandledDescription],
    spam: [messages.forms.emptySpamTitle, messages.forms.emptySpamDescription],
  }[status];

  return (
    <Stack gap={4}>
      <Inline gap={4} justify="between">
        <Segmented
          label={messages.forms.statusFilter}
          selected={status}
          onChange={(id) => setStatus(id as SubmissionStatus)}
          options={STATUSES.map((id) => ({ id, label: counts.data ? messages.forms.statusWithCount(messages.forms.statuses[id], counts.data[id]) : messages.forms.statuses[id] }))}
        />
        <Button
          variant="secondary"
          icon={Download}
          isPending={exportFile.isPending}
          onPress={() =>
            exportFile.mutate(form.id, {
              onSuccess: (csv) => {
                downloadText(`${form.key}-submissions.csv`, csv, 'text/csv;charset=utf-8');
                toast({ title: messages.forms.exported, description: messages.forms.exportedDescription, tone: 'success' });
              },
              onError: (error) => toast({ title: messages.forms.notExported, description: messageOf(error), tone: 'danger' }),
            })
          }
        >
          {messages.forms.export}
        </Button>
      </Inline>
      {submissions.isPending && <LoadingState shape="table" />}
      {submissions.isError && <ErrorState error={submissions.error} onRetry={() => void submissions.refetch()} />}
      {submissions.isSuccess && rows.length === 0 && <EmptyState icon={Inbox} title={empty[0] ?? ''} description={empty[1] ?? ''} />}
      {submissions.isSuccess && rows.length > 0 && <Table label={messages.forms.submissionsOf(name)} columns={columns} rows={rows} onRowAction={setOpenId} />}
      {/* Made anew for each submission. It closes when the submission leaves the list it was opened from. */}
      {opened && <SubmissionDialog key={opened.id} form={form} submission={opened} sender={senderOf(opened)} onClose={() => setOpenId(null)} />}
    </Stack>
  );
}

interface SubmissionDialogProps {
  readonly form: FormDef;
  readonly submission: Submission;
  readonly sender: string;
  readonly onClose: () => void;
}

/** One submission in full: every answer under its field's label, and what can be done with it. */
function SubmissionDialog({ form, submission, sender, onClose }: SubmissionDialogProps) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const locale = useLocale();
  const mark = useMarkSubmission();
  const remove = useDeleteSubmission();
  const [isDeleting, setDeleting] = useState(false);

  // Every field the form has or had, in its order: an answer under a removed field is still theirs.
  const answers = form.fields.flatMap((field) => {
    const value = submission.data[field.id];
    if (value === undefined) return [];
    const label = field.deletedAt === undefined ? localized(field.label, locale) : messages.forms.removedField(field.key);
    return [{ id: field.id, label, value: answerText(value, messages.forms.yes) }];
  });
  const set = (status: SubmissionStatus) =>
    mark.mutate(
      { id: submission.id, status },
      {
        onSuccess: () => {
          toast({ title: messages.forms.marked[status], tone: 'success' });
          close();
        },
        onError: (error) => toast({ title: messages.forms.notMarked, description: messageOf(error), tone: 'danger' }),
      },
    );
  const isBusy = mark.isPending || remove.isPending;

  return (
    <>
      <Dialog
        {...dialog}
        placement="side"
        title={messages.forms.submissionTitle(sender)}
        closeLabel={messages.app.dismiss}
        footer={
          <>
            <Button variant="ghost" isDisabled={isBusy} onPress={() => setDeleting(true)}>
              {messages.forms.deleteSubmission}
            </Button>
            {submission.status === 'spam' ? (
              <Button variant="secondary" isDisabled={isBusy} onPress={() => set('new')}>
                {messages.forms.notSpam}
              </Button>
            ) : (
              <Button variant="secondary" isDisabled={isBusy} onPress={() => set('spam')}>
                {messages.forms.markSpam}
              </Button>
            )}
            {submission.status === 'new' && (
              <Button isPending={mark.isPending} onPress={() => set('handled')}>
                {messages.forms.markHandled}
              </Button>
            )}
            {submission.status === 'handled' && (
              <Button isPending={mark.isPending} onPress={() => set('new')}>
                {messages.forms.markNew}
              </Button>
            )}
          </>
        }
      >
        <Stack gap={5}>
          <Stack gap={0}>
            <Text size="sm" tone="muted">
              {messages.forms.received(relativeTime(submission.createdAt, locale))}
            </Text>
            {submission.page !== undefined && (
              <Text size="sm" tone="muted">
                {messages.forms.sentFrom(submission.page)}
              </Text>
            )}
            {submission.handledAt !== undefined && (
              <Text size="sm" tone="muted">
                {messages.forms.handledAt(relativeTime(submission.handledAt, locale))}
              </Text>
            )}
          </Stack>
          {answers.map((answer) => (
            <Stack key={answer.id} gap={1}>
              <Text size="sm" weight="semibold" tone="secondary">
                {answer.label}
              </Text>
              {/* As text, a line at a time: what a visitor wrote is never markup here. */}
              {answer.value.split('\n').map((line, index) => (
                <Text key={index}>{line}</Text>
              ))}
            </Stack>
          ))}
        </Stack>
      </Dialog>
      <ConfirmDialog
        isOpen={isDeleting}
        onOpenChange={setDeleting}
        title={messages.forms.deleteSubmissionTitle}
        confirmLabel={messages.forms.deleteSubmission}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() =>
          remove.mutate(submission.id, {
            onSuccess: () => {
              toast({ title: messages.forms.submissionDeleted, tone: 'success' });
              setDeleting(false);
              close();
            },
            onError: (error) => {
              toast({ title: messages.forms.submissionNotDeleted, description: messageOf(error), tone: 'danger' });
              setDeleting(false);
            },
          })
        }
      >
        {messages.forms.deleteSubmissionDescription}
      </ConfirmDialog>
    </>
  );
}
