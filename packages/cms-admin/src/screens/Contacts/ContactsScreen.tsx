import type { Contact } from '@velocity-astro/cms-core';
import { Box, Button, Dialog, EmptyState, Form, Inline, PageHeader, SearchField, Segmented, Select, Stack, Table, Tag, Text, TextField, toast, type TableColumn, type TableRow } from '@velocity-astro/cms-ui';
import { Columns3, Contact as ContactIcon, FileUp, List, ListFilter, ListPlus, Plus, SearchX, Settings2 } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { paths } from '../../app/paths.js';
import { useGo } from '../../app/use-go.js';
import { AdminRequestError } from '../../client/errors.js';
import { useContacts, useCreateContact, useForms, usePipeline, useSession, useTeam } from '../../client/queries.js';
import { CustomFieldsDialog } from '../../fields/CustomFieldsDialog.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useClosing } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { useSourceOf } from './contact-source.js';
import { ImportDialog } from './ImportDialog.js';
import { PipelineBoard } from './PipelineBoard.js';
import { STAGE_TONE, useFollowUp, useOwnerName, useStageName } from './pipeline.js';
import { StagesDialog } from './StagesDialog.js';

const ALL = 'all';
const MINE = 'mine';
const NOBODY = 'nobody';
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
  const session = useSession();
  const [address, setAddress] = useSearchParams();
  const view = address.get('view') === 'board' ? 'board' : 'list';
  const [stage, setStage] = useState(ALL);
  const [owner, setOwner] = useState(ALL);
  const ownerId = owner === ALL ? undefined : owner === NOBODY ? null : owner === MINE ? session.data?.id : owner;
  const filter = { ...(search !== '' && { search }), ...(ownerId !== undefined && { ownerId }) };
  const contacts = useContacts({ limit: 200, ...filter, ...(stage !== ALL && { stage }) });
  const forms = useForms();
  const pipeline = usePipeline();
  const team = useTeam();
  const sourceOf = useSourceOf(forms.data);
  const stageName = useStageName();
  const ownerName = useOwnerName(team.data);
  const followUp = useFollowUp();
  const [isCreating, setCreating] = useState(false);
  const [isEditingStages, setEditingStages] = useState(false);
  const [isEditingFields, setEditingFields] = useState(false);
  const [isImporting, setImporting] = useState(false);
  const stages = pipeline.data?.stages ?? [];
  const isNarrowed = stage !== ALL || owner !== ALL;

  const columns: TableColumn[] = [
    { id: 'name', label: messages.contacts.columnName },
    { id: 'stage', label: messages.contacts.columnStage },
    { id: 'owner', label: messages.contacts.columnOwner, isSecondary: true },
    { id: 'followUp', label: messages.contacts.columnFollowUp, isSecondary: true },
    { id: 'source', label: messages.contacts.columnSource, isSecondary: true },
    { id: 'added', label: messages.contacts.columnAdded, align: 'end', isSecondary: true },
  ];
  const rows: TableRow[] = (contacts.data?.items ?? []).map((contact: Contact) => {
    const placed = stages.find((candidate) => candidate.id === contact.stage);
    const due = contact.followUpAt === undefined ? undefined : followUp(contact.followUpAt);
    return {
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
      stage: placed ? <Tag tone={STAGE_TONE[placed.kind]}>{stageName(placed)}</Tag> : '',
      owner: <Text tone="secondary">{ownerName(contact.ownerId)}</Text>,
      followUp: due ? due.tone === 'neutral' ? <Text tone="secondary">{due.text}</Text> : <Tag tone={due.tone}>{due.text}</Tag> : '',
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
    };
  });
  const create = (
    <Button icon={Plus} collapses onPress={() => setCreating(true)}>
      {messages.contacts.newContact}
    </Button>
  );
  const isEmpty = contacts.isSuccess && rows.length === 0;

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader
          title={messages.contacts.title}
          description={messages.contacts.description}
          secondary={{
            moreLabel: messages.app.moreActions,
            actions: [
              { id: 'fields', label: messages.customFields.button, icon: ListPlus, onPress: () => setEditingFields(true) },
              { id: 'import', label: messages.contactImport.button, icon: FileUp, onPress: () => setImporting(true) },
            ],
          }}
          actions={
            <>
              {/* The two views as icons, named in a tooltip, so the bar keeps to one row on a phone. */}
              <Segmented
                label={messages.contacts.view}
                areLabelsHidden
                options={[
                  { id: 'list', label: messages.contacts.viewList, icon: List },
                  { id: 'board', label: messages.contacts.viewBoard, icon: Columns3 },
                ]}
                selected={view}
                onChange={(next) => setAddress(next === 'board' ? { view: 'board' } : {}, { replace: true })}
              />
              {create}
            </>
          }
        />
        <Stack gap={2}>
          <SearchField label={messages.contacts.search} placeholder={messages.contacts.searchPlaceholder} value={words} onChange={setWords} clearLabel={messages.contacts.clearSearch} />
          <Inline gap={3} align="end" justify="between" wrap>
            <Inline gap={3} align="end" wrap>
              {view === 'list' && (
                <Select
                  label={messages.contacts.filterStage}
                  width="sm"
                  options={[{ id: ALL, label: messages.contacts.allStages }, ...stages.map((candidate) => ({ id: candidate.id, label: stageName(candidate) }))]}
                  value={stage}
                  onChange={setStage}
                />
              )}
              <Select
                label={messages.contacts.filterOwner}
                width="sm"
                options={[
                  { id: ALL, label: messages.contacts.everyone },
                  { id: MINE, label: messages.contacts.mine },
                  { id: NOBODY, label: messages.contacts.nobody },
                  ...(team.data ?? []).filter((member) => member.id !== session.data?.id).map((member) => ({ id: member.id, label: member.name })),
                ]}
                value={owner}
                onChange={setOwner}
              />
            </Inline>
            {view === 'board' && pipeline.isSuccess && (
              <Button variant="secondary" icon={Settings2} onPress={() => setEditingStages(true)}>
                {messages.contacts.editStages}
              </Button>
            )}
          </Inline>
          {view === 'list' && contacts.isSuccess && (
            <Text size="sm" tone="muted">
              {messages.contacts.count(contacts.data.total)}
            </Text>
          )}
        </Stack>
        {view === 'board' && pipeline.isPending && <LoadingState shape="summary" />}
        {view === 'board' && pipeline.isError && <ErrorState error={pipeline.error} onRetry={() => void pipeline.refetch()} />}
        {view === 'board' && pipeline.isSuccess && <PipelineBoard pipeline={pipeline.data} team={team.data} filter={filter} />}
        {view === 'list' && <>
        {contacts.isPending && <LoadingState shape="table" />}
        {contacts.isError && <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />}
        {isEmpty && search === '' && isNarrowed && <EmptyState icon={ListFilter} title={messages.contacts.nothingMatchesTitle} description={messages.contacts.nothingMatchesDescription} />}
        {isEmpty && search === '' && !isNarrowed && <EmptyState icon={ContactIcon} title={messages.contacts.emptyTitle} description={messages.contacts.emptyDescription} action={create} />}
        {isEmpty && search !== '' && <EmptyState icon={SearchX} title={messages.contacts.nothingFoundTitle} description={messages.contacts.nothingFoundDescription(search)} />}
        {contacts.isSuccess && rows.length > 0 && <Table label={messages.contacts.title} columns={columns} rows={rows} onRowAction={(id) => go(paths.contact(id))} />}
        </>}
      </Stack>
      {isImporting && <ImportDialog onClose={() => setImporting(false)} />}
      {isEditingFields && <CustomFieldsDialog of="contact" onClose={() => setEditingFields(false)} />}
      {isEditingStages && pipeline.data && <StagesDialog pipeline={pipeline.data} team={team.data ?? []} onClose={() => setEditingStages(false)} />}
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
