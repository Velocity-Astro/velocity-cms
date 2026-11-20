import { liveFields, type BlockDef, type BlockValue, type FieldDef } from '@velocity-astro/cms-core';
import { ConfirmDialog, OptionPicker, SectionList, Text, type PickerOption } from '@velocity-astro/cms-ui';
import { Copy, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { localized, withValue } from '../lib/content.js';
import { useLast } from '../lib/use-closing.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { blockIcon } from './block-icons.js';
import type { FieldControlProps, WordsPlace } from './field-control.js';
import { FieldGrid } from './FieldGrid.js';
import { useControlFor } from './FieldSummary.js';
import { usePageFocus } from './page-focus.js';

const isSection = (value: unknown): value is BlockValue =>
  typeof value === 'object' && value !== null && typeof (value as BlockValue).id === 'string' && typeof (value as BlockValue).block === 'string';

/**
 * A few of a section's own words: the first line of text it holds, in the order of its fields.
 * `isWords` leaves out the fields that hold a choice or a figure, which say nothing about it.
 */
function summaryOf(block: BlockDef, section: BlockValue, isWords: (field: FieldDef) => boolean): string | undefined {
  for (const field of liveFields(block.fields)) {
    const value = section.data[field.id];
    if (typeof value === 'string' && value.trim() !== '' && isWords(field)) return value;
  }
  return undefined;
}

/**
 * The sections of a page. Each is one of the blocks the field allows and opens to that block's
 * own fields, drawn by their own controls. What a section looks like on the site is the
 * template's business: here it is only data.
 */
export function BlocksControl({ field, label, help, value, onChange, path, problem, problems }: FieldControlProps) {
  const messages = useMessages();
  const locale = useLocale();
  const blocks: readonly BlockDef[] = Array.isArray(field.options['blocks']) ? (field.options['blocks'] as BlockDef[]) : [];
  const sections: readonly BlockValue[] = Array.isArray(value) ? value.filter(isSection) : [];
  const max = typeof field.options['max'] === 'number' ? field.options['max'] : undefined;

  const [openIds, setOpenIds] = useState<readonly string[]>([]);
  const [isPicking, setPicking] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // The field last pressed on the page, until the person turns to something else in the form.
  const [pointed, setPointed] = useState<{ readonly section: string; readonly key: string; readonly at: number } | null>(null);

  const controlFor = useControlFor();
  const focus = usePageFocus();
  const pressed = focus?.pressed;
  const change = (next: readonly BlockValue[]) => onChange(next.length === 0 ? undefined : next);
  const open = (id: string) => {
    setOpenIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    focus?.open(id);
  };
  // A section pressed on the page beside the form opens here.
  useEffect(() => {
    if (!pressed) return;
    setOpenIds((ids) => (ids.includes(pressed.id) ? ids : [...ids, pressed.id]));
    // A field inside a list is pointed at by the list it is in.
    const [key] = pressed.field?.split('.') ?? [];
    setPointed(key === undefined ? null : { section: pressed.id, key, at: pressed.at });
  }, [pressed]);
  // Where each section holds plain words, by the keys the page knows its fields by.
  const wordsOf = (section: BlockValue): readonly WordsPlace[] => {
    const block = blockOf(blocks, section);
    if (!block || block.retiredAt !== undefined) return [];
    return liveFields(block.fields).flatMap((inner) =>
      (controlFor(inner.type)?.words?.(inner, section.data[inner.id], controlFor) ?? []).map(({ place, put }) => ({
        place: place === '' ? inner.key : `${inner.key}.${place}`,
        put: (words: string) => withValue(section.data, inner.id, put(words)),
      })),
    );
  };
  const typable = Object.fromEntries(sections.map((section) => [section.id, wordsOf(section).map(({ place }) => place)]));
  const typableSaid = JSON.stringify(typable);
  const setTypable = focus?.setTypable;
  useEffect(() => setTypable?.(JSON.parse(typableSaid) as Record<string, string[]>), [setTypable, typableSaid]);
  // Words typed on the page go into the form as they are typed. Several may arrive before the
  // form is drawn again, so each builds on the one before.
  const held = useRef({ sections, wordsOf, change });
  useEffect(() => {
    held.current = { sections, wordsOf, change };
  });
  const onTyped = focus?.onTyped;
  useEffect(
    () =>
      onTyped?.((id, field, words) => {
        const now = held.current;
        const section = now.sections.find((candidate) => candidate.id === id);
        const place = section && now.wordsOf(section).find((candidate) => candidate.place === field);
        if (!section || !place) return;
        const next = now.sections.map((existing) => (existing.id === id ? { ...existing, data: place.put(words) as BlockValue['data'] } : existing));
        held.current = { ...now, sections: next };
        now.change(next);
      }),
    [onTyped],
  );
  const remove = (id: string) => {
    change(sections.filter((section) => section.id !== id));
    setOpenIds((ids) => ids.filter((candidate) => candidate !== id));
  };
  const nameOf = (block: BlockDef | undefined) => (block ? localized(block.label, locale) : messages.editor.sectionUnknown);

  const act = (id: string, action: string) => {
    const at = sections.findIndex((section) => section.id === id);
    const section = sections[at];
    if (!section) return;
    if (action === 'duplicate') {
      const copy: BlockValue = { ...section, id: crypto.randomUUID(), data: structuredClone(section.data) };
      change([...sections.slice(0, at + 1), copy, ...sections.slice(at + 1)]);
      open(copy.id);
    } else if (action === 'hide') {
      change(sections.map((existing) => (existing.id === id ? { ...existing, hidden: true as const } : existing)));
    } else if (action === 'show') {
      change(sections.map((existing) => (existing.id === id ? { id: existing.id, block: existing.block, data: existing.data } : existing)));
    } else if (action === 'remove') {
      // An empty section is removed at once: there is nothing to lose.
      if (Object.keys(section.data).length === 0) remove(id);
      else setRemovingId(id);
    }
  };

  // The picker offers what the template describes today, under the names it files them by.
  const byGroup = new Map<string, PickerOption[]>();
  for (const block of blocks) {
    if (block.retiredAt !== undefined) continue;
    const name = block.group ?? messages.editor.sectionOtherGroup;
    const options = byGroup.get(name) ?? [];
    options.push({
      id: block.id,
      label: localized(block.label, locale),
      icon: blockIcon(block.icon),
      ...(block.description !== undefined && { description: localized(block.description, locale) }),
    });
    byGroup.set(name, options);
  }
  const groups = [...byGroup].map(([name, options]) => ({ id: name, label: name, options }));

  const removing = useLast(removingId === null ? null : (sections.find((section) => section.id === removingId) ?? null));

  return (
    <>
      <SectionList
        label={label}
        {...(help !== undefined && { description: help })}
        {...(problem !== undefined && { errorMessage: problem })}
        emptyText={messages.editor.sectionsEmpty}
        addLabel={messages.editor.sectionAdd}
        onAdd={() => setPicking(true)}
        isFull={max !== undefined && sections.length >= max}
        openIds={openIds}
        revealId={pressed?.id}
        onOpenChange={(id, isOpen) => {
          setPointed(null);
          if (isOpen) open(id);
          else setOpenIds((ids) => ids.filter((candidate) => candidate !== id));
        }}
        onMove={(from, to) => {
          const next = [...sections];
          const [moved] = next.splice(from, 1);
          if (moved) next.splice(to, 0, moved);
          change(next);
        }}
        onAction={act}
        moveUpLabel={(position) => messages.editor.sectionMoveUp(nameOf(blockOf(blocks, sections[position - 1])), position)}
        moveDownLabel={(position) => messages.editor.sectionMoveDown(nameOf(blockOf(blocks, sections[position - 1])), position)}
        moreLabel={(position) => messages.editor.sectionMore(nameOf(blockOf(blocks, sections[position - 1])), position)}
        dragLabel={(position) => messages.editor.sectionDrag(nameOf(blockOf(blocks, sections[position - 1])), position)}
        items={sections.map((section, index) => {
          const block = blockOf(blocks, section);
          const isRetired = block === undefined || block.retiredAt !== undefined;
          const inner = block ? liveFields(block.fields) : [];
          const prefix = `${path}.${index}.`;
          const found = [...problems.keys()].filter((key) => key.startsWith(prefix)).length;
          const summary = block ? summaryOf(block, section, (inner) => controlFor(inner.type)?.width !== 'compact') : undefined;
          const hidden = section.hidden === true;
          return {
            id: section.id,
            title: nameOf(block),
            icon: blockIcon(block?.icon),
            ...(summary !== undefined && { summary }),
            ...(isRetired ? { tag: messages.editor.sectionRetired } : hidden && { tag: messages.editor.sectionHidden }),
            ...(found > 0 && { problem: messages.editor.sectionProblems(found) }),
            actions: [
              ...(isRetired
                ? []
                : [
                    { id: 'duplicate', label: messages.editor.sectionDuplicate, icon: Copy, isDisabled: max !== undefined && sections.length >= max },
                    hidden
                      ? { id: 'show', label: messages.editor.sectionShow, icon: Eye }
                      : { id: 'hide', label: messages.editor.sectionHide, icon: EyeOff },
                  ]),
              { id: 'remove', label: messages.editor.sectionRemove, icon: Trash2, tone: 'danger' as const },
            ],
            content: isRetired ? (
              <Text size="sm" tone="muted">
                {messages.editor.sectionRetiredNote}
              </Text>
            ) : inner.length === 0 ? (
              <Text size="sm" tone="muted">
                {messages.editor.sectionNoFields}
              </Text>
            ) : (
              <FieldGrid
                fields={inner}
                values={section.data}
                onChange={(child: FieldDef, next) =>
                  change(sections.map((existing) => (existing.id === section.id ? { ...existing, data: withValue(existing.data, child.id, next) } : existing)))
                }
                pathOf={(child) => `${prefix}${child.key}`}
                problems={problems}
                spotlight={pointed?.section === section.id ? pointed : {}}
              />
            ),
          };
        })}
      />
      <OptionPicker
        isOpen={isPicking}
        onOpenChange={setPicking}
        title={messages.editor.sectionPickerTitle}
        closeLabel={messages.editor.close}
        emptyText={messages.editor.sectionPickerEmpty}
        groups={groups}
        onChoose={(blockId) => {
          const added: BlockValue = { id: crypto.randomUUID(), block: blockId, data: {} };
          change([...sections, added]);
          open(added.id);
        }}
      />
      <ConfirmDialog
        isOpen={removingId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setRemovingId(null);
        }}
        title={messages.editor.sectionRemoveTitle(nameOf(blockOf(blocks, removing ?? undefined)))}
        confirmLabel={messages.editor.sectionRemoveConfirm}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        onConfirm={() => {
          if (removingId !== null) remove(removingId);
          setRemovingId(null);
        }}
      >
        {messages.editor.sectionRemoveDescription}
      </ConfirmDialog>
    </>
  );
}

function blockOf(blocks: readonly BlockDef[], section: BlockValue | undefined): BlockDef | undefined {
  return section ? blocks.find((candidate) => candidate.id === section.block) : undefined;
}
