import { liveFields, type BlockDef, type BlockValue, type FieldDef } from '@velocity-astro/cms-core';
import { Button, ConfirmDialog, Dialog, OptionPicker, SectionList, Text, type PickerOption } from '@velocity-astro/cms-ui';
import { Copy, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { localized, withValue } from '../lib/content.js';
import { useLast } from '../lib/use-closing.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { blockIcon } from './block-icons.js';
import type { FieldControlProps, LinkPlace, ListPlace, PicturePlace, WordsPlace } from './field-control.js';
import { FieldGrid } from './FieldGrid.js';
import { useControlFor } from './FieldSummary.js';
import { usePageFocus } from './page-focus.js';
import { SiteImagePicker } from './SiteImagePicker.js';

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
  // Where the section being picked goes: a place among the sections, or the end.
  const [pickAt, setPickAt] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // The picture being changed from the page: its section and its place in it.
  const [picturing, setPicturing] = useState<{ readonly section: string; readonly place: string } | null>(null);
  // The link being changed from the page, the same way.
  const [linking, setLinking] = useState<{ readonly section: string; readonly place: string } | null>(null);
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
  // Where each section holds a picture that can be changed from the page.
  const picturesOf = (section: BlockValue): readonly PicturePlace[] => {
    const block = blockOf(blocks, section);
    if (!block || block.retiredAt !== undefined) return [];
    return liveFields(block.fields).flatMap((inner) =>
      (controlFor(inner.type)?.pictures?.(inner, section.data[inner.id], controlFor) ?? []).map((found) => ({
        ...found,
        place: found.place === '' ? inner.key : `${inner.key}.${found.place}`,
        put: (name: string) => withValue(section.data, inner.id, found.put(name)),
      })),
    );
  };
  // Where each section holds a link that can be changed from the page.
  const linksOf = (section: BlockValue): readonly LinkPlace[] => {
    const block = blockOf(blocks, section);
    if (!block || block.retiredAt !== undefined) return [];
    return liveFields(block.fields).flatMap((inner) =>
      (controlFor(inner.type)?.links?.(inner, section.data[inner.id], controlFor) ?? []).map((found) => ({
        ...found,
        place: found.place === '' ? inner.key : `${inner.key}.${found.place}`,
        put: (link: unknown) => withValue(section.data, inner.id, found.put(link)),
      })),
    );
  };
  // Where each section holds a list whose items can be moved, copied and removed from the page.
  const listsOf = (section: BlockValue): readonly ListPlace[] => {
    const block = blockOf(blocks, section);
    if (!block || block.retiredAt !== undefined) return [];
    return liveFields(block.fields).flatMap((inner) =>
      (controlFor(inner.type)?.lists?.(inner, section.data[inner.id], controlFor) ?? []).map((found) => ({
        ...found,
        place: found.place === '' ? inner.key : `${inner.key}.${found.place}`,
        put: (items: readonly unknown[]) => withValue(section.data, inner.id, found.put(items)),
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
  const nameOf = (block: BlockDef | undefined) => (block ? localized(block.label, locale) : messages.editor.sectionUnknown);
  // What the page may offer on each section it shows. Hidden and retired sections are not on the page.
  const isFull = max !== undefined && sections.length >= max;
  const offered = {
    labels: {
      up: messages.editor.pageMoveUp,
      down: messages.editor.pageMoveDown,
      duplicate: messages.editor.pageDuplicate,
      remove: messages.editor.pageRemove,
      add: messages.editor.pageAdd,
      addBefore: messages.editor.pageAddBefore,
      addAfter: messages.editor.pageAddAfter,
      picture: messages.editor.pagePicture,
      link: messages.editor.pageLink,
      bold: messages.editor.richText.bold,
      italic: messages.editor.richText.italic,
      textLink: messages.editor.richText.link,
      itemUp: messages.editor.pageItemUp,
      itemDown: messages.editor.pageItemDown,
      itemDuplicate: messages.editor.pageItemDuplicate,
      itemRemove: messages.editor.pageItemRemove,
    },
    sections: Object.fromEntries(
      sections.map((section, at) => [section.id, { name: nameOf(blockOf(blocks, section)), up: at > 0, down: at < sections.length - 1, copy: !isFull, add: !isFull, pictures: picturesOf(section).map(({ place }) => place), links: linksOf(section).map(({ place }) => place), lists: listsOf(section).map(({ place, items, isFull }) => ({ field: place, count: items.length, full: isFull })) },
      ]),
    ),
  };
  const offeredSaid = JSON.stringify(offered);
  const setTools = focus?.setTools;
  useEffect(() => setTools?.(JSON.parse(offeredSaid) as typeof offered), [setTools, offeredSaid]);
  const remove = (id: string) => {
    change(sections.filter((section) => section.id !== id));
    setOpenIds((ids) => ids.filter((candidate) => candidate !== id));
  };
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

  // A button pressed on a section on the page does what the same button does here.
  const move = (from: number, to: number) => {
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    change(next);
  };
  const acting = useRef({ sections, act, move, isFull, listsOf, change });
  useEffect(() => {
    acting.current = { sections, act, move, isFull, listsOf, change };
  });
  const onActed = focus?.onActed;
  const show = focus?.open;
  useEffect(
    () =>
      onActed?.((id, action) => {
        const now = acting.current;
        const at = now.sections.findIndex((section) => section.id === id);
        if (at < 0) return;
        if (action === 'up' || action === 'down') {
          const to = action === 'up' ? at - 1 : at + 1;
          if (to < 0 || to >= now.sections.length) return;
          now.move(at, to);
          // The page is drawn again with the section in its new place, and brings it into view.
          show?.(id);
        } else if (action === 'addBefore' || action === 'addAfter') {
          if (now.isFull) return;
          setPickAt(action === 'addBefore' ? at : at + 1);
          setPicking(true);
        } else if (action !== 'duplicate' || !now.isFull) {
          now.act(id, action);
        }
      }),
    [onActed, show],
  );

  // The button on a picture of the page opens the window that picture is chosen in.
  const onPictured = focus?.onPictured;
  useEffect(() => onPictured?.((id, place) => setPicturing({ section: id, place })), [onPictured]);
  const pictureAt = useLast(picturing);
  const pictureSection = pictureAt && sections.find((section) => section.id === pictureAt.section);
  const picture = pictureSection && picturesOf(pictureSection).find((candidate) => candidate.place === pictureAt.place);

  // A button on an item of a list on the page does what the list's own row does in the form.
  const onItemActed = focus?.onItemActed;
  useEffect(
    () =>
      onItemActed?.((id, field, at, action) => {
        const now = acting.current;
        const section = now.sections.find((candidate) => candidate.id === id);
        const list = section && now.listsOf(section).find((candidate) => candidate.place === field);
        const item = list?.items[at];
        if (!section || !list || at < 0 || at >= list.items.length) return;
        const next = [...list.items];
        if (action === 'remove') {
          next.splice(at, 1);
        } else if (action === 'duplicate') {
          if (list.isFull) return;
          next.splice(at + 1, 0, structuredClone(item));
        } else {
          const to = action === 'up' ? at - 1 : at + 1;
          if (to < 0 || to >= next.length) return;
          next.splice(at, 1);
          next.splice(to, 0, item);
        }
        now.change(now.sections.map((existing) => (existing.id === id ? { ...existing, data: list.put(next) as BlockValue['data'] } : existing)));
      }),
    [onItemActed],
  );

  // The button on a link of the page opens a window that holds the link's own field.
  const onLinked = focus?.onLinked;
  useEffect(() => onLinked?.((id, place) => setLinking({ section: id, place })), [onLinked]);
  const linkAt = useLast(linking);
  const linkSection = linkAt && sections.find((section) => section.id === linkAt.section);
  const link = linkSection && linksOf(linkSection).find((candidate) => candidate.place === linkAt.place);

  // A section dragged on the page lands where the form would put it.
  const onDragged = focus?.onDragged;
  useEffect(
    () =>
      onDragged?.((id, beforeId) => {
        const now = acting.current;
        const from = now.sections.findIndex((section) => section.id === id);
        const before = beforeId === null ? now.sections.length : now.sections.findIndex((section) => section.id === beforeId);
        if (from < 0 || before < 0) return;
        // Taking it out first moves everything after it one place up.
        const to = before > from ? before - 1 : before;
        if (to === from) return;
        now.move(from, to);
        show?.(id);
      }),
    [onDragged, show],
  );

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
      ...(block.thumbnail !== undefined && { image: block.thumbnail }),
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
        onAdd={() => {
          setPickAt(null);
          setPicking(true);
        }}
        isFull={isFull}
        openIds={openIds}
        revealId={pressed?.id}
        onOpenChange={(id, isOpen) => {
          setPointed(null);
          if (isOpen) open(id);
          else setOpenIds((ids) => ids.filter((candidate) => candidate !== id));
        }}
        onMove={move}
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
          const at = pickAt ?? sections.length;
          change([...sections.slice(0, at), added, ...sections.slice(at)]);
          open(added.id);
        }}
      />
      {pictureSection && picture && (
        <SiteImagePicker
          label={messages.editor.pagePicture}
          value={picture.name}
          onChange={(name) => change(sections.map((existing) => (existing.id === pictureSection.id ? { ...existing, data: picture.put(name) as BlockValue['data'] } : existing)))}
          window={{
            isOpen: picturing !== null,
            onOpenChange: (isOpen) => {
              if (!isOpen) setPicturing(null);
            },
          }}
        />
      )}
      {linkSection && link && (
        <Dialog
          isOpen={linking !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) setLinking(null);
          }}
          title={messages.editor.pageLink}
          closeLabel={messages.editor.close}
          footer={
            <Button variant="primary" onPress={() => setLinking(null)}>
              {messages.editor.pageLinkDone}
            </Button>
          }
        >
          <FieldGrid
            fields={[link.field]}
            values={{ [link.field.id]: link.link }}
            onChange={(_field: FieldDef, next) => change(sections.map((existing) => (existing.id === linkSection.id ? { ...existing, data: link.put(next) as BlockValue['data'] } : existing)))}
            pathOf={() => `${path}.${sections.indexOf(linkSection)}.${link.place}`}
            problems={problems}
            perRow={1}
          />
        </Dialog>
      )}
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
