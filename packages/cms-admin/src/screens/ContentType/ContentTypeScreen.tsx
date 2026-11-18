import type { ContentTypeDef, FieldDef } from '@velocity/cms-core';
import { Box, Button, ConfirmDialog, Dialog, EmptyState, Form, Heading, IconButton, Inline, Link, PageHeader, Stack, Table, Tag, Text, TextField, toast, type TableColumn, type TableRow } from '@velocity/cms-ui';
import { ArrowDown, ArrowUp, ListPlus, Pencil, Plus, Settings2, Shapes, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { paths } from '../../app/paths.js';
import { AdminRequestError } from '../../client/errors.js';
import { useArrangeFields, useContentTypes, useRemoveField, useRestoreField, useUpdateContentType } from '../../client/queries.js';
import { NO_SECTION, moved, placesOf } from '../../lib/arrangement.js';
import { localized } from '../../lib/content.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { FieldDialog } from './FieldDialog.js';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One content type: its fields as the editor shows them, and the ways to add, change, order and remove them. */
export function ContentTypeScreen() {
  const { typeKey = '' } = useParams();
  const messages = useMessages();
  const types = useContentTypes();

  if (types.isPending) return <LoadingState />;
  if (types.isError) return <ErrorState error={types.error} onRetry={() => void types.refetch()} />;
  const type = types.data.find((candidate) => candidate.key === typeKey);
  if (!type) {
    return (
      <EmptyState
        icon={Shapes}
        title={messages.builder.notFoundTitle}
        description={messages.builder.notFoundDescription}
        action={<Link href={paths.types}>{messages.builder.backToTypes}</Link>}
      />
    );
  }
  return <TypeBuilder type={type} />;
}

function TypeBuilder({ type }: { readonly type: ContentTypeDef }) {
  const messages = useMessages();
  const locale = useLocale();
  const arrange = useArrangeFields();
  const remove = useRemoveField();
  const restore = useRestoreField();
  const [isAdding, setAdding] = useState(false);
  const [isChangingSettings, setChangingSettings] = useState(false);
  const [editing, setEditing] = useState<FieldDef | null>(null);
  const [leaving, setLeaving] = useState<FieldDef | null>(null);

  const name = localized(type.label, locale);
  const places = placesOf(type);
  const hasSections = places.length > 1;
  const gone = type.fields.filter((field) => field.deletedAt !== undefined);
  const hasFields = places.some((place) => place.fields.length > 0);
  const labelOf = (field: FieldDef) => localized(field.label, locale);

  const move = (field: FieldDef, by: -1 | 1) =>
    arrange.mutate({ typeId: type.id, arrangement: moved(type, field.id, by) }, { onError: (error) => toast({ title: messages.builder.notMoved, description: messageOf(error), tone: 'danger' }) });

  const columns: TableColumn[] = [
    { id: 'field', label: messages.builder.columnField },
    { id: 'kind', label: messages.builder.columnKind },
    { id: 'rules', label: messages.builder.columnRules },
    { id: 'actions', label: messages.builder.columnActions, align: 'end' },
  ];
  const nameCell = (field: FieldDef) => (
    <Stack gap={0}>
      <Text weight="semibold">{labelOf(field)}</Text>
      <Text size="sm" tone="muted">
        {field.key}
      </Text>
    </Stack>
  );
  const kindCell = (field: FieldDef) => <Tag>{messages.builder.kinds[field.type]?.name ?? field.type}</Tag>;
  const rowsOf = (fields: readonly FieldDef[]): TableRow[] =>
    fields.map((field, index) => ({
      id: field.id,
      cells: {
        field: nameCell(field),
        kind: kindCell(field),
        rules: (
          <Inline gap={2}>
            {field.required && <Tag tone="info">{messages.builder.required}</Tag>}
            {!field.translated && <Tag>{messages.builder.sameInEveryLanguage}</Tag>}
          </Inline>
        ),
        actions: (
          <Inline gap={1} justify="end">
            <IconButton size="sm" label={messages.builder.moveUp(labelOf(field))} icon={ArrowUp} isDisabled={index === 0 || arrange.isPending} onPress={() => move(field, -1)} />
            <IconButton size="sm" label={messages.builder.moveDown(labelOf(field))} icon={ArrowDown} isDisabled={index === fields.length - 1 || arrange.isPending} onPress={() => move(field, 1)} />
            <IconButton size="sm" label={messages.builder.edit(labelOf(field))} icon={Pencil} onPress={() => setEditing(field)} />
            <IconButton size="sm" label={messages.builder.remove(labelOf(field))} icon={Trash2} onPress={() => setLeaving(field)} />
          </Inline>
        ),
      },
    }));
  const addField = (
    <Button icon={Plus} onPress={() => setAdding(true)}>
      {messages.builder.addField}
    </Button>
  );

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={8}>
        <Stack gap={2}>
          <Link href={paths.types}>{messages.builder.backToTypes}</Link>
          <PageHeader
            title={name}
            description={[messages.builder.keyIs(type.key), type.urlPattern ?? messages.builder.noAddress].join(' · ')}
            actions={
              <Inline gap={2}>
                <Button variant="secondary" icon={Settings2} onPress={() => setChangingSettings(true)}>
                  {messages.builder.settings}
                </Button>
                {addField}
              </Inline>
            }
          />
          <Link href={paths.contentList(type.key)}>{messages.builder.viewEntries}</Link>
        </Stack>

        {!hasFields && <EmptyState icon={ListPlus} title={messages.builder.noFieldsTitle} description={messages.builder.noFieldsDescription} action={addField} />}
        {hasFields &&
          places.map((place) => {
            const section = type.sections?.find((candidate) => candidate.key === place.key);
            const heading = section ? localized(section.label, locale) : messages.builder.otherFields;
            // A type with no sections has one list, which needs no heading of its own.
            if (!hasSections) return <Table key={place.key} label={messages.builder.fields} columns={columns} rows={rowsOf(place.fields)} />;
            if (place.key === NO_SECTION && place.fields.length === 0) return null;
            return (
              <Stack key={place.key} gap={3}>
                <Stack gap={0}>
                  <Heading level={2} size="md">
                    {heading}
                  </Heading>
                  {!section && (
                    <Text size="sm" tone="muted">
                      {messages.builder.otherFieldsDescription}
                    </Text>
                  )}
                </Stack>
                <Table label={messages.builder.fieldsOf(heading)} columns={columns} rows={rowsOf(place.fields)} empty={messages.builder.noFieldsHere} />
              </Stack>
            );
          })}

        {gone.length > 0 && (
          <Stack gap={3}>
            <Stack gap={0}>
              <Heading level={2} size="md">
                {messages.builder.removedFields}
              </Heading>
              <Text size="sm" tone="muted">
                {messages.builder.removedFieldsDescription}
              </Text>
            </Stack>
            <Table
              label={messages.builder.removedFields}
              columns={columns.filter((column) => column.id !== 'rules')}
              rows={gone.map((field) => ({
                id: field.id,
                cells: {
                  field: nameCell(field),
                  kind: kindCell(field),
                  actions: (
                    <Button
                      variant="secondary"
                      size="sm"
                      isDisabled={restore.isPending}
                      onPress={() =>
                        restore.mutate(
                          { typeId: type.id, fieldId: field.id },
                          {
                            onSuccess: () => toast({ title: messages.builder.restored(labelOf(field)), tone: 'success' }),
                            onError: (error) => toast({ title: messages.builder.notRestored, description: messageOf(error), tone: 'danger' }),
                          },
                        )
                      }
                    >
                      {messages.builder.restoreField(labelOf(field))}
                    </Button>
                  ),
                },
              }))}
            />
          </Stack>
        )}
      </Stack>

      {/* Each window is made anew when it opens, so it never shows the last field's details. */}
      {isAdding && <FieldDialog type={type} onClose={() => setAdding(false)} />}
      {editing && <FieldDialog type={type} field={editing} onClose={() => setEditing(null)} />}
      {isChangingSettings && <SettingsDialog type={type} onClose={() => setChangingSettings(false)} />}
      <ConfirmDialog
        isOpen={leaving !== null}
        onOpenChange={(isOpen) => !isOpen && setLeaving(null)}
        title={messages.builder.removeTitle(leaving ? labelOf(leaving) : '')}
        confirmLabel={messages.builder.removeConfirm}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() => {
          if (!leaving) return;
          remove.mutate(
            { typeId: type.id, fieldId: leaving.id },
            {
              onSuccess: () => toast({ title: messages.builder.removed(labelOf(leaving)), tone: 'success' }),
              onError: (error) => toast({ title: messages.builder.notRemoved, description: messageOf(error), tone: 'danger' }),
              onSettled: () => setLeaving(null),
            },
          );
        }}
      >
        {messages.builder.removeDescription}
      </ConfirmDialog>
    </Box>
  );
}

/** The window a content type's own name and address are changed in. */
function SettingsDialog({ type, onClose }: { readonly type: ContentTypeDef; readonly onClose: () => void }) {
  const messages = useMessages();
  const locale = useLocale();
  const update = useUpdateContentType();
  const [name, setName] = useState(localized(type.label, locale));
  const [address, setAddress] = useState(type.urlPattern ?? '');
  const [problems, setProblems] = useState<Readonly<Record<string, string>>>({});

  const send = () => {
    if (name.trim() === '') return setProblems({ label: messages.builder.typeNameNeeded });
    setProblems({});
    update.mutate(
      { id: type.id, changes: { label: { ...type.label, [locale.split('-')[0] ?? locale]: name.trim() }, urlPattern: address.trim() === '' ? null : address.trim() } },
      {
        onSuccess: () => {
          toast({ title: messages.builder.settingsSaved, tone: 'success' });
          onClose();
        },
        onError: (error) => {
          const issues = error instanceof AdminRequestError ? error.issues : [];
          setProblems({ [String(issues[0]?.path[0] ?? 'urlPattern')]: messageOf(error) });
          toast({ title: messages.builder.settingsNotSaved, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  const title = messages.builder.settingsTitle(localized(type.label, locale));
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title={title}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={update.isPending} onPress={send}>
            {messages.builder.settingsSave}
          </Button>
        </>
      }
    >
      <Form label={title} gap={4} onSubmit={send}>
        <TextField label={messages.builder.typeName} value={name} onChange={setName} isRequired autoFocus autoComplete="off" {...(problems['label'] !== undefined && { errorMessage: problems['label'] })} />
        <TextField
          label={messages.builder.typeAddress}
          description={messages.builder.typeAddressHelp}
          value={address}
          onChange={setAddress}
          autoComplete="off"
          {...(problems['urlPattern'] !== undefined && { errorMessage: problems['urlPattern'] })}
        />
      </Form>
    </Dialog>
  );
}
