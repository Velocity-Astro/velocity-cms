import type { Contact } from '@velocity/cms-core';
import { Box, Button, Dialog, EmptyState, Form, PageHeader, SearchField, Stack, Table, Text, TextField, toast, type TableColumn, type TableRow } from '@velocity/cms-ui';
import { Contact as ContactIcon, Plus, SearchX } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { paths } from '../../app/paths.js';
import { useGo } from '../../app/use-go.js';
import { AdminRequestError } from '../../client/errors.js';
import { useContacts, useCreateContact, useForms, useSession } from '../../client/queries.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useClosing } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { useSourceOf } from './contact-source.js';

const NO_PROBLEMS: Readonly<Record<string, string>> = {};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Everyone who wrote to the site or was added by hand, newest first, with a search. */
export function ContactsScreen() {
  const messages = useMessages();
  const session = useSession();
  const mayRead = session.data !== null && session.data !== undefined && session.data.role !== 'author';
  // Contacts are personal data: an author who finds the address is told so, and nothing is asked for.
  if (!mayRead) return <EmptyState icon={ContactIcon} title={messages.contacts.title} description={messages.contacts.noAccess} />;
  return <ContactList />;
}

function ContactList() {
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const [words, setWords] = useState('');
  const search = useDeferredValue(words.trim());
  const contacts = useContacts({ limit: 200, ...(search !== '' && { search }) });
  const forms = useForms();
  const sourceOf = useSourceOf(forms.data);
  const [isCreating, setCreating] = useState(false);

  const columns: TableColumn[] = [
    { id: 'name', label: messages.contacts.columnName },
    { id: 'phone', label: messages.contacts.columnPhone },
    { id: 'source', label: messages.contacts.columnSource },
    { id: 'added', label: messages.contacts.columnAdded, align: 'end' },
  ];
  const rows: TableRow[] = (contacts.data?.items ?? []).map((contact: Contact) => ({
    id: contact.id,
    cells: {
      name: (
        <Stack gap={0}>
          <Text weight="semibold">{contact.name ?? contact.email}</Text>
          {contact.name !== undefined && (
            <Text size="sm" tone="muted">
              {contact.email}
            </Text>
          )}
        </Stack>
      ),
      phone: contact.phone ?? '',
      source: (
        <Text size="sm" tone="secondary">
          {sourceOf(contact)}
        </Text>
      ),
      added: (
        <Text size="sm" tone="muted">
          {relativeTime(contact.createdAt, locale)}
        </Text>
      ),
    },
  }));
  const create = (
    <Button icon={Plus} onPress={() => setCreating(true)}>
      {messages.contacts.newContact}
    </Button>
  );
  const isEmpty = contacts.isSuccess && rows.length === 0;

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader title={messages.contacts.title} description={messages.contacts.description} actions={create} />
        <Stack gap={2}>
          <SearchField label={messages.contacts.search} placeholder={messages.contacts.searchPlaceholder} value={words} onChange={setWords} clearLabel={messages.contacts.clearSearch} />
          {contacts.isSuccess && (
            <Text size="sm" tone="muted">
              {messages.contacts.count(contacts.data.total)}
            </Text>
          )}
        </Stack>
        {contacts.isPending && <LoadingState shape="table" />}
        {contacts.isError && <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />}
        {isEmpty && search === '' && <EmptyState icon={ContactIcon} title={messages.contacts.emptyTitle} description={messages.contacts.emptyDescription} action={create} />}
        {isEmpty && search !== '' && <EmptyState icon={SearchX} title={messages.contacts.nothingFoundTitle} description={messages.contacts.nothingFoundDescription(search)} />}
        {contacts.isSuccess && rows.length > 0 && <Table label={messages.contacts.title} columns={columns} rows={rows} onRowAction={(id) => go(paths.contact(id))} />}
      </Stack>
      {/* Made anew each time it opens, so it never shows what was typed last time. */}
      {isCreating && <NewContactDialog onClose={() => setCreating(false)} />}
    </Box>
  );
}

/** The window a contact is added in by hand. */
function NewContactDialog({ onClose }: { readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const go = useGo();
  const create = useCreateContact();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [problems, setProblems] = useState(NO_PROBLEMS);

  const send = () => {
    if (email.trim() === '') return setProblems({ email: messages.contacts.emailNeeded });
    setProblems(NO_PROBLEMS);
    create.mutate(
      { email, ...(name.trim() !== '' && { name }), ...(phone.trim() !== '' && { phone }) },
      {
        onSuccess: (contact) => {
          toast({ title: messages.contacts.created(contact.name ?? contact.email), tone: 'success' });
          close();
          go(paths.contact(contact.id));
        },
        onError: (error) => {
          // What was typed stays; each problem goes to the field it names.
          if (error instanceof AdminRequestError) setProblems(Object.fromEntries(error.issues.map((issue) => [String(issue.path[0]), issue.message])));
          toast({ title: messages.contacts.notCreated, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  return (
    <Dialog
      {...dialog}
      title={messages.contacts.newContactTitle}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={create.isPending} onPress={send}>
            {messages.contacts.create}
          </Button>
        </>
      }
    >
      <Form label={messages.contacts.newContactTitle} gap={4} onSubmit={send}>
        <TextField label={messages.contacts.name} value={name} onChange={setName} autoFocus autoComplete="off" {...(problems['name'] !== undefined && { errorMessage: problems['name'] })} />
        <TextField label={messages.contacts.email} type="email" value={email} onChange={setEmail} isRequired autoComplete="off" {...(problems['email'] !== undefined && { errorMessage: problems['email'] })} />
        <TextField label={messages.contacts.phone} type="tel" value={phone} onChange={setPhone} autoComplete="off" {...(problems['phone'] !== undefined && { errorMessage: problems['phone'] })} />
      </Form>
    </Dialog>
  );
}
