import { liveFields, type FormDef } from '@velocity-astro/cms-core';
import { Box, Button, ConfirmDialog, Dialog, EmptyState, Form, Heading, Inline, PageHeader, Stack, Table, Tag, Text, TextField, toast, type TableColumn, type TableRow } from '@velocity-astro/cms-ui';
import { Inbox, Plus, UserX } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { paths } from '../../app/paths.js';
import { useGo } from '../../app/use-go.js';
import { AdminRequestError } from '../../client/errors.js';
import { useCreateForm, useDeleteForm, useForgetSender, useForms, useRestoreForm, useSession, useSubmissionCountsOf, useTrashedForms } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { typeKeyFrom } from '../../lib/keys.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useClosing, useLast } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

const NO_PROBLEMS: Readonly<Record<string, string>> = {};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Every form the site has, how much is new in each, and the way to start one. */
export function FormsScreen() {
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const forms = useForms();
  const session = useSession();
  // What visitors sent, and changing a form, are for owners and editors. An author sees the list alone.
  const mayManage = session.data !== null && session.data !== undefined && session.data.role !== 'author';
  const trashed = useTrashedForms(mayManage);
  const counts = useSubmissionCountsOf((forms.data ?? []).map((form) => form.id), mayManage);
  const restore = useRestoreForm();
  const remove = useDeleteForm();
  const [isCreating, setCreating] = useState(false);
  const [isForgetting, setForgetting] = useState(false);
  const [leaving, setLeaving] = useState<FormDef | null>(null);
  const asked = useLast(leaving);
  const nameOf = (form: FormDef) => localized(form.label, locale);

  const columns: TableColumn[] = [
    { id: 'name', label: messages.forms.columnName },
    { id: 'fields', label: messages.forms.columnFields, isSecondary: true },
    { id: 'fresh', label: messages.forms.columnNew },
    { id: 'status', label: messages.forms.columnStatus },
  ];
  const nameCell = (form: FormDef) => (
    <Stack gap={0}>
      <Text weight="semibold">{nameOf(form)}</Text>
      <Text size="sm" tone="muted">
        {form.key}
      </Text>
    </Stack>
  );
  const rows: TableRow[] = (forms.data ?? []).map((form, index) => {
    const fresh = counts[index]?.data?.new;
    return {
      id: form.id,
      cells: {
        name: nameCell(form),
        fields: messages.forms.fieldCount(liveFields(form.fields).length),
        fresh: fresh === undefined ? '' : fresh > 0 ? <Tag tone="info">{messages.forms.newCount(fresh)}</Tag> : <Text tone="muted">{messages.forms.noneNew}</Text>,
        status: form.open ? <Tag tone="success">{messages.forms.open}</Tag> : <Tag>{messages.forms.closed}</Tag>,
      },
    };
  });
  const trashedColumns: TableColumn[] = [
    { id: 'name', label: messages.forms.columnName },
    { id: 'moved', label: messages.forms.columnTrashed },
    { id: 'actions', label: messages.forms.columnActions, align: 'end' },
  ];
  const trashedRows: TableRow[] = (trashed.data ?? []).map((form) => ({
    id: form.id,
    cells: {
      name: nameCell(form),
      moved: (
        <Text size="sm" tone="muted">
          {form.deletedAt === undefined ? '' : relativeTime(form.deletedAt, locale)}
        </Text>
      ),
      actions: (
        <Inline gap={2} justify="end">
          <Button
            variant="secondary"
            size="sm"
            isPending={restore.isPending && restore.variables === form.id}
            onPress={() =>
              restore.mutate(form.id, {
                onSuccess: () => toast({ title: messages.forms.restored(nameOf(form)), tone: 'success' }),
                onError: (error) => toast({ title: messages.forms.notRestored, description: messageOf(error), tone: 'danger' }),
              })
            }
          >
            {messages.forms.restore(nameOf(form))}
          </Button>
          <Button variant="ghost" size="sm" onPress={() => setLeaving(form)}>
            {messages.forms.delete(nameOf(form))}
          </Button>
        </Inline>
      ),
    },
  }));
  const create = (
    <Button icon={Plus} onPress={() => setCreating(true)}>
      {messages.forms.newForm}
    </Button>
  );

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader
          title={messages.forms.title}
          description={messages.forms.description}
          actions={
            mayManage && (
            <Inline gap={2}>
              <Button variant="ghost" icon={UserX} onPress={() => setForgetting(true)}>
                {messages.forms.forget}
              </Button>
              {create}
            </Inline>
            )
          }
        />
        {forms.isPending && <LoadingState shape="table" />}
        {forms.isError && <ErrorState error={forms.error} onRetry={() => void forms.refetch()} />}
        {forms.isSuccess && rows.length === 0 && <EmptyState icon={Inbox} title={messages.forms.emptyTitle} description={messages.forms.emptyDescription} {...(mayManage && { action: create })} />}
        {forms.isSuccess && rows.length > 0 && <Table label={messages.forms.title} columns={columns} rows={rows} onRowAction={(id) => go(paths.form(id))} />}
        {trashed.isError && <ErrorState error={trashed.error} onRetry={() => void trashed.refetch()} />}
        {trashed.isSuccess && trashedRows.length > 0 && (
          <Stack gap={3}>
            <Stack gap={0}>
              <Heading level={2} size="md">
                {messages.forms.trashedTitle}
              </Heading>
              <Text size="sm" tone="muted">
                {messages.forms.trashedHelp}
              </Text>
            </Stack>
            <Table label={messages.forms.trashedTitle} columns={trashedColumns} rows={trashedRows} />
          </Stack>
        )}
      </Stack>
      {/* Made anew each time it opens, so it never shows what was typed last time. */}
      {isCreating && <NewFormDialog onClose={() => setCreating(false)} />}
      {isForgetting && <ForgetDialog onClose={() => setForgetting(false)} />}
      <ConfirmDialog
        isOpen={leaving !== null}
        onOpenChange={(isOpen) => !isOpen && setLeaving(null)}
        title={messages.forms.deleteTitle(asked ? nameOf(asked) : '')}
        confirmLabel={messages.forms.deleteConfirm}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() => {
          if (!leaving) return;
          remove.mutate(leaving.id, {
            onSuccess: () => toast({ title: messages.forms.deleted(nameOf(leaving)), tone: 'success' }),
            onError: (error) => toast({ title: messages.forms.notDeleted, description: messageOf(error), tone: 'danger' }),
            onSettled: () => setLeaving(null),
          });
        }}
      >
        {messages.forms.deleteDescription}
      </ConfirmDialog>
    </Box>
  );
}

/** The window a form is started in: what it is called and its key. Its fields are added on its own screen. */
function NewFormDialog({ onClose }: { readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const create = useCreateForm();
  const [name, setName] = useState('');
  // The key follows the name until someone writes a key of their own.
  const [ownKey, setOwnKey] = useState<string | null>(null);
  const [problems, setProblems] = useState(NO_PROBLEMS);
  const key = ownKey ?? typeKeyFrom(name);

  const send = () => {
    const missing = { ...(name.trim() === '' && { label: messages.forms.nameNeeded }), ...(key === '' && { key: messages.forms.keyNeeded }) };
    setProblems(missing);
    if (Object.keys(missing).length > 0) return;
    create.mutate(
      { key, label: { [locale.split('-')[0] ?? locale]: name.trim() } },
      {
        onSuccess: (form) => {
          toast({ title: messages.forms.created(name.trim()), description: messages.forms.createdDescription, tone: 'success' });
          close();
          go(paths.form(form.id));
        },
        onError: (error) => {
          // Whatever the server refuses here is about the key: the name is free.
          setProblems({ key: messageOf(error) });
          toast({ title: messages.forms.notCreated, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  return (
    <Dialog
      {...dialog}
      title={messages.forms.newFormTitle}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={create.isPending} onPress={send}>
            {messages.forms.create}
          </Button>
        </>
      }
    >
      <Form label={messages.forms.newFormTitle} gap={4} onSubmit={send}>
        <TextField
          label={messages.forms.formName}
          description={messages.forms.formNameHelp}
          value={name}
          onChange={setName}
          isRequired
          autoFocus
          autoComplete="off"
          {...(problems['label'] !== undefined && { errorMessage: problems['label'] })}
        />
        <TextField
          label={messages.forms.formKey}
          description={messages.forms.formKeyHelp}
          value={key}
          onChange={setOwnKey}
          isRequired
          autoComplete="off"
          {...(problems['key'] !== undefined && { errorMessage: problems['key'] })}
        />
      </Form>
    </Dialog>
  );
}

/** The window that deletes everything one person sent, for when they ask to be forgotten. */
function ForgetDialog({ onClose }: { readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const forget = useForgetSender();
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const send = () => {
    if (email.trim() === '') return setProblem(messages.forms.forgetEmailNeeded);
    setProblem(null);
    forget.mutate(email, {
      onSuccess: (count) => {
        toast({ title: messages.forms.forgotten(count), ...(count > 0 && { tone: 'success' as const }) });
        close();
      },
      onError: (error) => {
        if (error instanceof AdminRequestError && error.code === 'validation_failed') setProblem(error.message);
        toast({ title: messages.forms.notForgotten, description: messageOf(error), tone: 'danger' });
      },
    });
  };

  return (
    <Dialog
      {...dialog}
      title={messages.forms.forgetTitle}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button variant="danger" isPending={forget.isPending} onPress={send}>
            {messages.forms.forgetConfirm}
          </Button>
        </>
      }
    >
      <Form label={messages.forms.forgetTitle} gap={4} onSubmit={send}>
        <Text tone="secondary">{messages.forms.forgetHelp}</Text>
        <TextField label={messages.forms.forgetEmail} type="email" value={email} onChange={setEmail} isRequired autoFocus autoComplete="off" {...(problem !== null && { errorMessage: problem })} />
      </Form>
    </Dialog>
  );
}
