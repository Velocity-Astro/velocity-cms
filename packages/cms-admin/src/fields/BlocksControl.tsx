import { liveFields, type BlockDef, type BlockValue, type FieldDef } from '@velocity-astro/cms-core';
import { Button, ConfirmDialog, Dialog, OptionPicker, SectionList, Text, type PickerOption } from '@velocity-astro/cms-ui';
import { Copy, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { localized, withValue } from '../lib/content.js';
import { useLast } from '../lib/use-closing.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { blockIcon } from './block-icons.js';
import { carriedSection } from './carry.js';
import type { FieldControl, FieldControlProps, LinkPlace, ListPlace, PicturePlace, SwatchPlace, WordsPlace } from './field-control.js';
import { FieldGrid } from './FieldGrid.js';
import { useControlFor } from './FieldSummary.js';
import { PageFocusInside, usePageFocus } from './page-focus.js';
import { SiteImagePicker } from './SiteImagePicker.js';

const isSection = (value: unknown): value is BlockValue =>
  typeof value === 'object' && value !== null && typeof (value as BlockValue).id === 'string' && typeof (value as BlockValue).block === 'string';

/**
 * A few of a section's own words: the first line of text it holds, in the order of its fields.
 * `isWords` leaves out the fields that hold a choice, a figure or a picture's name, which say nothing about it.
 */
function summaryOf(block: BlockDef, section: BlockValue, isWords: (field: FieldDef) => boolean): string | undefined {
  for (const field of liveFields(block.fields)) {
    const value = section.data[field.id];
    if (typeof value === 'string' && value.trim() !== '' && isWords(field)) return value;
  }
  return undefined;
}

/** The sections one field holds: the page's own, or those of a place inside one of its sections. */
interface Held {
  /** Nothing for the page's own sections. For a place inside a section, the section and the place: `id:columns.0.content`. */
  readonly key: string;
  /** Lists that take each other's sections: those that take the same blocks, by their keys. */
  readonly group: string;
  readonly blocks: readonly BlockDef[];
  readonly sections: readonly BlockValue[];
  readonly max: number | undefined;
  /** Where the list is in the entry, as field keys. */
  readonly path: string;
  /** The sections this list is inside, outermost first. */
  readonly inside: readonly string[];
  /** The page's sections with these in this list. */
  readonly to: (next: readonly BlockValue[]) => readonly BlockValue[];
}

type ControlFor = (type: string) => FieldControl | undefined;

const blocksOf = (field: FieldDef): readonly BlockDef[] => (Array.isArray(field.options['blocks']) ? (field.options['blocks'] as BlockDef[]) : []);
const maxOf = (field: FieldDef): number | undefined => (typeof field.options['max'] === 'number' ? field.options['max'] : undefined);
const isFull = (list: Held): boolean => list.max !== undefined && list.sections.length >= list.max;
const withData = (list: Held, id: string, data: unknown): readonly BlockValue[] =>
  list.to(list.sections.map((existing) => (existing.id === id ? { ...existing, data: data as BlockValue['data'] } : existing)));

/** A list and every list inside its sections, outermost first. */
function gather(list: Held, controlFor: ControlFor): Held[] {
  const inner = list.sections.flatMap((section, index) => {
    const block = blockOf(list.blocks, section);
    if (!block || block.retiredAt !== undefined) return [];
    return liveFields(block.fields).flatMap((field) =>
      (controlFor(field.type)?.sections?.(field, section.data[field.id], controlFor) ?? []).flatMap((found) => {
        const place = found.place === '' ? field.key : `${field.key}.${found.place}`;
        return gather(
          {
            key: `${section.id}:${place}`,
            group: blocksOf(found.field).filter((block) => block.retiredAt === undefined).map((block) => block.key).sort().join('|'),
            blocks: blocksOf(found.field),
            sections: found.sections.filter(isSection),
            max: maxOf(found.field),
            path: `${list.path}.${index}.${place}`,
            inside: [...list.inside, section.id],
            to: (next) => withData(list, section.id, withValue(section.data, field.id, found.put(next))),
          },
          controlFor,
        );
      }),
    );
  });
  return [list, ...inner];
}

function locate(lists: readonly Held[], id: string): { readonly list: Held; readonly at: number; readonly section: BlockValue } | undefined {
  for (const list of lists) {
    const at = list.sections.findIndex((section) => section.id === id);
    const section = list.sections[at];
    if (section) return { list, at, section };
  }
  return undefined;
}

/** A copy of a section with an id of its own, and one for every section inside it. */
export function copyOf<Value>(value: Value): Value {
  if (Array.isArray(value)) return value.map((item: unknown) => copyOf(item)) as Value;
  if (typeof value !== 'object' || value === null) return value;
  const copied = Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyOf(inner)]));
  return (isSection(value) ? { ...copied, id: crypto.randomUUID() } : copied) as Value;
}

/** The places of one kind (words, pictures, links) a section holds, by the keys the page knows its fields by. */
function placesIn<Kept, Place extends { readonly place: string; readonly put: (held: Kept) => unknown }>(
  list: { readonly blocks: readonly BlockDef[] },
  section: BlockValue,
  ask: (control: FieldControl, field: FieldDef, value: unknown) => readonly Place[] | undefined,
  controlFor: ControlFor,
): readonly Place[] {
  const block = blockOf(list.blocks, section);
  if (!block || block.retiredAt !== undefined) return [];
  return liveFields(block.fields).flatMap((inner) => {
    const control = controlFor(inner.type);
    return ((control && ask(control, inner, section.data[inner.id])) ?? []).map((found) => ({
      ...found,
      place: found.place === '' ? inner.key : `${inner.key}.${found.place}`,
      put: (held: Kept) => withValue(section.data, inner.id, found.put(held)),
    }));
  });
}

/**
 * The sections of a page. Each is one of the blocks the field allows and opens to that block's
 * own fields, drawn by their own controls. What a section looks like on the site is the
 * template's business: here it is only data.
 *
 * A block may hold sections of its own (the columns of a row). In the form those are drawn by
 * the control of the field that holds them, which is this one again. To the page, the field that
 * holds the whole page answers for every section in it, however deep.
 */
export function BlocksControl({ field, label, help, value, onChange, path, problem, problems }: FieldControlProps) {
  const messages = useMessages();
  const locale = useLocale();
  const blocks = blocksOf(field);
  const sections: readonly BlockValue[] = Array.isArray(value) ? value.filter(isSection) : [];
  const max = maxOf(field);

  const [openIds, setOpenIds] = useState<readonly string[]>([]);
  const [isPicking, setPicking] = useState(false);
  // Where the section being picked goes: the list, and a place among its sections or the end.
  const [pick, setPick] = useState<{ readonly key: string; readonly at: number | null }>({ key: '', at: null });
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
  const opened = focus?.opened;
  const change = (next: readonly BlockValue[]) => onChange(next.length === 0 ? undefined : next);
  const listsOf = (all: readonly BlockValue[]) => gather({ key: '', group: '', blocks, sections: all, max, path, inside: [], to: (next) => next }, controlFor);
  const lists = listsOf(sections);
  const own = lists[0];

  const wordsOf = (list: Held, section: BlockValue) => placesIn<string, WordsPlace>(list, section, (control, inner, held) => control.words?.(inner, held, controlFor), controlFor);
  const picturesOf = (list: Held, section: BlockValue) => placesIn<string, PicturePlace>(list, section, (control, inner, held) => control.pictures?.(inner, held, controlFor), controlFor);
  const linksOf = (list: Held, section: BlockValue) => placesIn<unknown, LinkPlace>(list, section, (control, inner, held) => control.links?.(inner, held, controlFor), controlFor);
  const itemsOf = (list: Held, section: BlockValue) => placesIn<readonly unknown[], ListPlace>(list, section, (control, inner, held) => control.lists?.(inner, held, controlFor), controlFor);
  const swatchesOf = (list: Held, section: BlockValue) => placesIn<string, SwatchPlace>(list, section, (control, inner, held) => control.swatches?.(inner, held, controlFor), controlFor);

  // What the handlers below work from: what the form holds now, whenever the page speaks.
  const held = useRef({ sections, lists, listsOf, change, wordsOf, itemsOf, swatchesOf });
  useEffect(() => {
    held.current = { sections, lists, listsOf, change, wordsOf, itemsOf, swatchesOf };
  });

  const open = (id: string) => {
    setOpenIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    focus?.open(id);
  };
  // A section opens with every section it is inside.
  const reveal = (id: string) => {
    const wanted = [...(locate(held.current.lists, id)?.list.inside ?? []), id];
    setOpenIds((ids) => (wanted.every((one) => ids.includes(one)) ? ids : [...new Set([...ids, ...wanted])]));
  };
  // A section pressed on the page beside the form opens here.
  useEffect(() => {
    if (!pressed) return;
    reveal(pressed.id);
    // A field inside a list is pointed at by the list it is in.
    const [key] = pressed.field?.split('.') ?? [];
    setPointed(key === undefined ? null : { section: pressed.id, key, at: pressed.at });
  }, [pressed]);
  // So does one opened from somewhere else: a section added inside another from the page.
  useEffect(() => {
    if (opened !== undefined) reveal(opened);
  }, [opened]);

  const isInside = focus?.isInside === true;
  const typable = isInside ? {} : Object.fromEntries(lists.flatMap((list) => list.sections.map((section) => [section.id, wordsOf(list, section).map(({ place }) => place)])));
  const typableSaid = JSON.stringify(typable);
  const setTypable = focus?.setTypable;
  useEffect(() => setTypable?.(JSON.parse(typableSaid) as Record<string, string[]>), [setTypable, typableSaid]);
  // Words typed on the page go into the form as they are typed. Several may arrive before the
  // form is drawn again, so each builds on the one before.
  const onTyped = focus?.onTyped;
  useEffect(
    () =>
      onTyped?.((id, place, words) => {
        const now = held.current;
        const found = locate(now.lists, id);
        const at = found && now.wordsOf(found.list, found.section).find((candidate) => candidate.place === place);
        if (!found || !at) return;
        const next = withData(found.list, id, at.put(words));
        held.current = { ...now, sections: next, lists: now.listsOf(next) };
        now.change(next);
      }),
    [onTyped],
  );
  const nameOf = (block: BlockDef | undefined) => (block ? localized(block.label, locale) : messages.editor.sectionUnknown);
  // What the page may offer on each section it shows. Hidden and retired sections are not on the page.
  const offered = isInside
    ? undefined
    : {
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
          lists.flatMap((list) =>
            list.sections.map((section, at) => [
              section.id,
              {
                name: nameOf(blockOf(list.blocks, section)),
                up: at > 0,
                down: at < list.sections.length - 1,
                copy: !isFull(list),
                add: !isFull(list),
                pictures: picturesOf(list, section).map(({ place }) => place),
                links: linksOf(list, section).map(({ place }) => place),
                lists: itemsOf(list, section).map((found) => ({ field: found.place, count: found.items.length, full: found.isFull })),
                swatches: swatchesOf(list, section).map((found) => ({ field: found.place, name: localized(found.field.label, locale), ...(found.chosen !== undefined && { chosen: found.chosen }), choices: found.choices.map((choice) => ({ value: choice.value, name: choice.name(locale), colour: choice.colour })) })),
                list: list.key,
                group: list.group,
              },
            ]),
          ),
        ),
        slots: Object.fromEntries(lists.slice(1).map((list) => [list.key, { group: list.group, empty: list.sections.length === 0, full: isFull(list) }])),
      };
  const offeredSaid = JSON.stringify(offered);
  const setTools = focus?.setTools;
  useEffect(() => {
    if (offeredSaid !== undefined) setTools?.(JSON.parse(offeredSaid) as NonNullable<typeof offered>);
  }, [setTools, offeredSaid]);

  const remove = (id: string) => {
    const found = locate(lists, id);
    if (found) change(found.list.to(found.list.sections.filter((section) => section.id !== id)));
    setOpenIds((ids) => ids.filter((candidate) => candidate !== id));
  };
  const act = (id: string, action: string) => {
    const found = locate(held.current.lists, id);
    if (!found) return;
    const { list, at, section } = found;
    if (action === 'duplicate') {
      if (isFull(list)) return;
      const copy = copyOf(section);
      change(list.to([...list.sections.slice(0, at + 1), copy, ...list.sections.slice(at + 1)]));
      open(copy.id);
    } else if (action === 'hide') {
      change(list.to(list.sections.map((existing) => (existing.id === id ? { ...existing, hidden: true as const } : existing))));
    } else if (action === 'show') {
      change(list.to(list.sections.map((existing) => (existing.id === id ? { id: existing.id, block: existing.block, data: existing.data } : existing))));
    } else if (action === 'remove') {
      // An empty section is removed at once: there is nothing to lose.
      if (Object.keys(section.data).length === 0) remove(id);
      else setRemovingId(id);
    }
  };

  const moveIn = (list: Held, from: number, to: number) => {
    const next = [...list.sections];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    change(list.to(next));
  };
  const acting = useRef({ act, moveIn });
  useEffect(() => {
    acting.current = { act, moveIn };
  });
  // A button pressed on a section on the page does what the same button does here.
  const onActed = focus?.onActed;
  const show = focus?.open;
  useEffect(
    () =>
      onActed?.((id, action) => {
        const found = locate(held.current.lists, id);
        if (!found) return;
        const { list, at } = found;
        if (action === 'up' || action === 'down') {
          const to = action === 'up' ? at - 1 : at + 1;
          if (to < 0 || to >= list.sections.length) return;
          acting.current.moveIn(list, at, to);
          // The page is drawn again with the section in its new place, and brings it into view.
          show?.(id);
        } else if (action === 'addBefore' || action === 'addAfter') {
          if (isFull(list)) return;
          setPick({ key: list.key, at: action === 'addBefore' ? at : at + 1 });
          setPicking(true);
        } else {
          acting.current.act(id, action);
        }
      }),
    [onActed, show],
  );

  // The button of an empty place inside a section offers what can be added there.
  const onSlotted = focus?.onSlotted;
  useEffect(
    () =>
      onSlotted?.((id, place) => {
        const list = held.current.lists.find((candidate) => candidate.key === `${id}:${place}`);
        if (!list || isFull(list)) return;
        setPick({ key: list.key, at: null });
        setPicking(true);
      }),
    [onSlotted],
  );

  // A swatch pressed on a section's bar chooses what the same swatch chooses in the form.
  const onSwatched = focus?.onSwatched;
  useEffect(
    () =>
      onSwatched?.((id, place, chosen) => {
        const now = held.current;
        const found = locate(now.lists, id);
        const swatch = found && now.swatchesOf(found.list, found.section).find((candidate) => candidate.place === place);
        // Only a choice the field has, whatever the page said.
        if (!found || !swatch || swatch.chosen === chosen || !swatch.choices.some((choice) => choice.value === chosen)) return;
        now.change(withData(found.list, id, swatch.put(chosen)));
      }),
    [onSwatched],
  );

  // The button on a picture of the page opens the window that picture is chosen in.
  const onPictured = focus?.onPictured;
  useEffect(() => onPictured?.((id, place) => setPicturing({ section: id, place })), [onPictured]);
  const pictureAt = useLast(picturing);
  const pictureIn = pictureAt ? locate(lists, pictureAt.section) : undefined;
  const picture = pictureIn && picturesOf(pictureIn.list, pictureIn.section).find((candidate) => candidate.place === pictureAt?.place);

  // A button on an item of a list on the page does what the list's own row does in the form.
  const onItemActed = focus?.onItemActed;
  useEffect(
    () =>
      onItemActed?.((id, place, at, action) => {
        const now = held.current;
        const found = locate(now.lists, id);
        const list = found && now.itemsOf(found.list, found.section).find((candidate) => candidate.place === place);
        const item = list?.items[at];
        if (!found || !list || at < 0 || at >= list.items.length) return;
        const next = [...list.items];
        if (action === 'remove') {
          next.splice(at, 1);
        } else if (action === 'duplicate') {
          if (list.isFull) return;
          next.splice(at + 1, 0, copyOf(item));
        } else {
          const to = action === 'up' ? at - 1 : at + 1;
          if (to < 0 || to >= next.length) return;
          next.splice(at, 1);
          next.splice(to, 0, item);
        }
        now.change(withData(found.list, id, list.put(next)));
      }),
    [onItemActed],
  );

  // The button on a link of the page opens a window that holds the link's own field.
  const onLinked = focus?.onLinked;
  useEffect(() => onLinked?.((id, place) => setLinking({ section: id, place })), [onLinked]);
  const linkAt = useLast(linking);
  const linkIn = linkAt ? locate(lists, linkAt.section) : undefined;
  const link = linkIn && linksOf(linkIn.list, linkIn.section).find((candidate) => candidate.place === linkAt?.place);

  // A section dragged on the page lands where the form would put it: among the sections it was
  // with, or in another place that takes the same blocks.
  const onDragged = focus?.onDragged;
  useEffect(
    () =>
      onDragged?.((id, beforeId, into) => {
        const now = held.current;
        const found = locate(now.lists, id);
        if (!found) return;
        const from = found.list;
        if (into === undefined || into === from.key) {
          const before = beforeId === null ? from.sections.length : from.sections.findIndex((section) => section.id === beforeId);
          if (before < 0) return;
          // Taking it out first moves everything after it one place up.
          const to = before > found.at ? before - 1 : before;
          if (to === found.at) return;
          acting.current.moveIn(from, found.at, to);
        } else {
          const target = now.lists.find((candidate) => candidate.key === into);
          // Only into a place that holds the same blocks, has room, and is not inside the section itself.
          if (!target || target.group !== from.group || isFull(target) || target.inside.includes(id)) return;
          const without = from.to(from.sections.filter((section) => section.id !== id));
          const there = now.listsOf(without).find((candidate) => candidate.key === into);
          if (!there) return;
          const before = beforeId === null ? there.sections.length : there.sections.findIndex((section) => section.id === beforeId);
          if (before < 0) return;
          // The same block there may go by other ids: the section is held as that place holds it.
          const carried = carriedSection(from.blocks, there.blocks, found.section, controlFor);
          if (!carried) return;
          now.change(there.to([...there.sections.slice(0, before), carried, ...there.sections.slice(before)]));
        }
        show?.(id);
      }),
    [onDragged, show],
  );

  // The picker offers what the place being added to takes.
  const picking = lists.find((list) => list.key === pick.key) ?? own;
  // It offers what the template describes today, under the names it files them by.
  const byGroup = new Map<string, PickerOption[]>();
  for (const block of picking?.blocks ?? []) {
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

  const removingIn = removingId === null ? undefined : locate(lists, removingId);
  const removingName = useLast(removingIn ? nameOf(blockOf(removingIn.list.blocks, removingIn.section)) : null);

  return (
    <>
      <SectionList
        label={label}
        {...(help !== undefined && { description: help })}
        {...(problem !== undefined && { errorMessage: problem })}
        emptyText={messages.editor.sectionsEmpty}
        addLabel={messages.editor.sectionAdd}
        onAdd={() => {
          setPick({ key: '', at: null });
          setPicking(true);
        }}
        isFull={own !== undefined && isFull(own)}
        openIds={openIds}
        revealId={pressed?.id}
        onOpenChange={(id, isOpen) => {
          setPointed(null);
          if (isOpen) open(id);
          else setOpenIds((ids) => ids.filter((candidate) => candidate !== id));
        }}
        onMove={(from, to) => {
          if (own) moveIn(own, from, to);
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
          const summary = block ? summaryOf(block, section, (inner) => controlFor(inner.type)?.width !== 'compact' && controlFor(inner.type)?.pictures === undefined) : undefined;
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
              <PageFocusInside>
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
              </PageFocusInside>
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
          if (!picking) return;
          const at = pick.at ?? picking.sections.length;
          change(picking.to([...picking.sections.slice(0, at), added, ...picking.sections.slice(at)]));
          open(added.id);
        }}
      />
      {pictureIn && picture && (
        <SiteImagePicker
          label={messages.editor.pagePicture}
          value={picture.name}
          onChange={(name) => change(withData(pictureIn.list, pictureIn.section.id, picture.put(name)))}
          window={{
            isOpen: picturing !== null,
            onOpenChange: (isOpen) => {
              if (!isOpen) setPicturing(null);
            },
          }}
        />
      )}
      {linkIn && link && (
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
            onChange={(_field: FieldDef, next) => change(withData(linkIn.list, linkIn.section.id, link.put(next)))}
            pathOf={() => `${linkIn.list.path}.${linkIn.at}.${link.place}`}
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
        title={messages.editor.sectionRemoveTitle(removingName ?? messages.editor.sectionUnknown)}
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
