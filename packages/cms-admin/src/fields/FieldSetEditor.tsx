import type { FieldDef } from '@velocity-astro/cms-core';
import { Button, ConfirmDialog, EmptyState, IconButton, Inline, Stack, Table, Tag, Text, toast, type TableColumn, type TableRow } from '@velocity-astro/cms-ui';
import { ArrowDown, ArrowUp, ListPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { localized } from '../lib/content.js';
import { useLast } from '../lib/use-closing.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { FieldSetDialog } from './FieldSetDialog.js';
import { movedBy, toInput, type FieldSet } from './field-set.js';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface FieldSetEditorProps {
  readonly set: FieldSet;
  /** False for someone who may look and not change. */
  readonly mayChange: boolean;
}

/** A list of simple fields, in order, with the ways to add, change, order and remove one. */
export function FieldSetEditor({ set, mayChange }: FieldSetEditorProps) {
  const messages = useMessages();
  const locale = useLocale();
  const [isAdding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FieldDef | null>(null);
  const [leaving, setLeaving] = useState<FieldDef | null>(null);
  const asked = useLast(leaving);
  const { fields } = set;
  const inputs = fields.map(toInput);
  const labelOf = (field: FieldDef) => localized(field.label, locale);

  const move = (field: FieldDef, by: -1 | 1) =>
    set.save(movedBy(inputs, field.id, by), { onError: (error) => toast({ title: messages.forms.notMoved, description: messageOf(error), tone: 'danger' }) });

  const columns: TableColumn[] = [
    { id: 'field', label: messages.forms.columnField },
    { id: 'kind', label: messages.forms.columnKind },
    { id: 'rules', label: messages.forms.columnRules },
    ...(mayChange ? [{ id: 'actions', label: messages.forms.columnActions, align: 'end' as const }] : []),
  ];
  const rows: TableRow[] = fields.map((field, index) => ({
    id: field.id,
    cells: {
      field: (
        <Stack gap={0}>
          <Text weight="semibold">{labelOf(field)}</Text>
          <Text size="sm" tone="muted">
            {field.key}
          </Text>
        </Stack>
      ),
      kind: <Tag>{messages.builder.kinds[field.type]?.name ?? field.type}</Tag>,
      rules: (
        <Inline gap={2}>
          {field.required && <Tag tone="info">{messages.forms.required}</Tag>}
          {set.tagsOf?.(field)}
        </Inline>
      ),
      actions: (
        <Inline gap={1} justify="end">
          <IconButton size="sm" label={messages.forms.moveUp(labelOf(field))} icon={ArrowUp} isDisabled={index === 0 || set.isPending} onPress={() => move(field, -1)} />
          <IconButton size="sm" label={messages.forms.moveDown(labelOf(field))} icon={ArrowDown} isDisabled={index === fields.length - 1 || set.isPending} onPress={() => move(field, 1)} />
          <IconButton size="sm" label={messages.forms.edit(labelOf(field))} icon={Pencil} onPress={() => setEditing(field)} />
          <IconButton size="sm" label={messages.forms.remove(labelOf(field))} icon={Trash2} onPress={() => setLeaving(field)} />
        </Inline>
      ),
    },
  }));
  const add = (
    <Button icon={Plus} onPress={() => setAdding(true)}>
      {messages.forms.addField}
    </Button>
  );

  return (
    <Stack gap={4}>
      {fields.length === 0 && <EmptyState icon={ListPlus} title={messages.forms.noFieldsTitle} description={set.words.emptyDescription} {...(mayChange && { action: add })} />}
      {fields.length > 0 && (
        <>
          {mayChange && <Inline justify="end">{add}</Inline>}
          <Table label={messages.forms.fieldsOf(set.name)} columns={columns} rows={rows} />
        </>
      )}
      {/* Each window is made anew when it opens, so it never shows the last field's details. */}
      {isAdding && <FieldSetDialog set={set} onClose={() => setAdding(false)} />}
      {editing && <FieldSetDialog set={set} field={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        isOpen={leaving !== null}
        onOpenChange={(isOpen) => !isOpen && setLeaving(null)}
        title={messages.forms.removeTitle(asked ? labelOf(asked) : '')}
        confirmLabel={messages.forms.removeConfirm}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={set.isPending}
        onConfirm={() => {
          if (!leaving) return;
          set.save(
            inputs.filter((field) => field.id !== leaving.id),
            {
              onSuccess: () => toast({ title: messages.forms.removed(labelOf(leaving)), tone: 'success' }),
              onError: (error) => toast({ title: messages.forms.notRemoved, description: messageOf(error), tone: 'danger' }),
              onSettled: () => setLeaving(null),
            },
          );
        }}
      >
        {set.words.removeDescription}
      </ConfirmDialog>
    </Stack>
  );
}
