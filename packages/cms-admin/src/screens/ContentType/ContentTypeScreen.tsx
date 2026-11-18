import type { ContentTypeDef, FieldDef } from '@velocity-astro/cms-core';
import { Box, Button, ConfirmDialog, EmptyState, Heading, IconButton, Inline, Link, PageHeader, Stack, Table, Tag, Text, toast, type TableColumn, type TableRow } from '@velocity-astro/cms-ui';
import { Archive, ArrowDown, ArrowUp, LayoutList, ListPlus, ListTree, Pencil, Plus, Settings2, Shapes, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useGo } from '../../app/use-go.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { WITHIN, paths } from '../../app/paths.js';
import { useArchiveContentType, useArrangeFields, useContentTypes, useRemoveField, useRestoreField } from '../../client/queries.js';
import { innerFields } from '../../fields/settings.js';
import { NO_SECTION, moved, movedWithin, placesOf, type FieldPlace } from '../../lib/arrangement.js';
import { localized } from '../../lib/content.js';
import { useLast } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { FieldDialog } from './FieldDialog.js';
import { SectionsDialog } from './SectionsDialog.js';
import { SettingsDialog } from './SettingsDialog.js';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One content type: its fields as the editor shows them, and the ways to add, change, order and remove them. */
export function ContentTypeScreen() {
  const { typeKey = '' } = useParams();
  const [search] = useSearchParams();
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
  // The address may lead into a group: each id names the field that holds the next.
  const holders: FieldDef[] = [];
  let fields: readonly FieldDef[] = type.fields;
  for (const id of search.getAll(WITHIN)) {
    const holder = fields.find((candidate) => candidate.id === id && candidate.deletedAt === undefined);
    const inner = holder ? innerFields(holder) : null;
    if (!holder || !inner) {
      return (
        <EmptyState
          icon={Shapes}
          title={messages.builder.notFoundTitle}
          description={messages.builder.notFoundDescription}
          action={<Link href={paths.type(type.key)}>{messages.builder.backTo(type.key)}</Link>}
        />
      );
    }
    holders.push(holder);
    fields = inner;
  }
  // Made anew for each place, so nothing chosen in one is left open in another.
  return <TypeBuilder key={holders.map((holder) => holder.id).join('/')} type={type} holders={holders} fields={fields} />;
}

interface TypeBuilderProps {
  readonly type: ContentTypeDef;
  /** The fields that hold the ones shown, from the top down. Empty for the type's own fields. */
  readonly holders: readonly FieldDef[];
  /** The fields shown, removed ones among them. */
  readonly fields: readonly FieldDef[];
}

function TypeBuilder({ type, holders, fields }: TypeBuilderProps) {
  const messages = useMessages();
  const locale = useLocale();
  const arrange = useArrangeFields();
  const remove = useRemoveField();
  const restore = useRestoreField();
  const [isAdding, setAdding] = useState(false);
  const [isChangingSettings, setChangingSettings] = useState(false);
  const [isChangingSections, setChangingSections] = useState(false);
  const archive = useArchiveContentType();
  const [isArchiving, setArchiving] = useState(false);
  const go = useGo();
  const within = holders.map((holder) => holder.id);
  const holder = holders.at(-1);
  const [editing, setEditing] = useState<FieldDef | null>(null);
  const [leaving, setLeaving] = useState<FieldDef | null>(null);
  const asked = useLast(leaving);

  const name = localized(type.label, locale);
  // A group's fields are one list. Sections lay out only a type's own.
  const places: FieldPlace[] = holder ? [{ key: NO_SECTION, fields: fields.filter((field) => field.deletedAt === undefined) }] : placesOf(type);
  const hasSections = places.length > 1;
  const gone = fields.filter((field) => field.deletedAt !== undefined);
  const hasFields = places.some((place) => place.fields.length > 0);
  const labelOf = (field: FieldDef) => localized(field.label, locale);

  const move = (field: FieldDef, by: -1 | 1) =>
    arrange.mutate({ typeId: type.id, arrangement: holder ? movedWithin(fields, field.id, by, within) : moved(type, field.id, by) }, { onError: (error) => toast({ title: messages.builder.notMoved, description: messageOf(error), tone: 'danger' }) });

  const columns: TableColumn[] = [
    { id: 'field', label: messages.builder.columnField },
    { id: 'kind', label: messages.builder.columnKind },
    { id: 'rules', label: messages.builder.columnRules },
    { id: 'actions', label: messages.builder.columnActions, align: 'end' },
  ];
  const nameCell = (field: FieldDef) => {
    const inner = innerFields(field);
    return (
      <Stack gap={0}>
        <Text weight="semibold">{labelOf(field)}</Text>
        <Text size="sm" tone="muted">
          {inner ? `${field.key} · ${messages.builder.holdsFields(inner.filter((held) => held.deletedAt === undefined).length)}` : field.key}
        </Text>
      </Stack>
    );
  };
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
            {innerFields(field) && (
              <IconButton size="sm" label={messages.builder.fieldsInside(labelOf(field))} icon={ListTree} onPress={() => go(paths.type(type.key, [...within, field.id]))} />
            )}
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
        {holder ? (
          <Stack gap={2}>
            <Link href={paths.type(type.key, within.slice(0, -1))}>{messages.builder.backTo(holders.length > 1 ? labelOf(holders.at(-2) as FieldDef) : name)}</Link>
            <PageHeader title={labelOf(holder)} description={messages.builder.insideOf(labelOf(holder), name)} actions={addField} />
          </Stack>
        ) : (
          <Stack gap={2}>
            <Link href={paths.types}>{messages.builder.backToTypes}</Link>
            <PageHeader
              title={name}
              description={[messages.builder.keyIs(type.key), type.urlPattern ?? messages.builder.noAddress].join(' · ')}
              actions={
                <Inline gap={2}>
                  <Button variant="ghost" icon={Archive} onPress={() => setArchiving(true)}>
                    {messages.builder.archive}
                  </Button>
                  <Button variant="secondary" icon={Settings2} onPress={() => setChangingSettings(true)}>
                    {messages.builder.settings}
                  </Button>
                  <Button variant="secondary" icon={LayoutList} onPress={() => setChangingSections(true)}>
                    {messages.builder.sections}
                  </Button>
                  {addField}
                </Inline>
              }
            />
            <Link href={paths.contentList(type.key)}>{messages.builder.viewEntries}</Link>
          </Stack>
        )}

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
                          { typeId: type.id, fieldId: field.id, within },
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
      {isAdding && <FieldDialog type={type} within={within} onClose={() => setAdding(false)} />}
      {editing && <FieldDialog type={type} field={editing} within={within} onClose={() => setEditing(null)} />}
      {isChangingSections && <SectionsDialog type={type} onClose={() => setChangingSections(false)} />}
      {isChangingSettings && <SettingsDialog type={type} onClose={() => setChangingSettings(false)} />}
      <ConfirmDialog
        isOpen={leaving !== null}
        onOpenChange={(isOpen) => !isOpen && setLeaving(null)}
        title={messages.builder.removeTitle(asked ? labelOf(asked) : '')}
        confirmLabel={messages.builder.removeConfirm}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() => {
          if (!leaving) return;
          remove.mutate(
            { typeId: type.id, fieldId: leaving.id, within },
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
      <ConfirmDialog
        isOpen={isArchiving}
        onOpenChange={setArchiving}
        title={messages.builder.archiveTitle(name)}
        confirmLabel={messages.builder.archiveConfirm}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={archive.isPending}
        onConfirm={() =>
          archive.mutate(type.id, {
            onSuccess: () => {
              toast({ title: messages.builder.archived(name), description: messages.builder.archivedDescription, tone: 'success' });
              go(paths.types);
            },
            onError: (error) => {
              toast({ title: messages.builder.notArchived, description: messageOf(error), tone: 'danger' });
              setArchiving(false);
            },
          })
        }
      >
        {messages.builder.archiveDescription}
      </ConfirmDialog>
    </Box>
  );
}
