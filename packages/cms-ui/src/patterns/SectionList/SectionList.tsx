import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Ellipsis, GripVertical, Plus, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button as AriaButton, Disclosure, DisclosurePanel, Heading, isTextDropItem, useDrag, useDrop } from 'react-aria-components';
import { Button } from '../../components/Button/index.js';
import { IconButton } from '../../components/IconButton/index.js';
import { Menu, type MenuAction } from '../../components/Menu/index.js';
import { Tag } from '../../components/Tag/index.js';
import {
  sectionActionsClass,
  sectionChevronClass,
  sectionDropLineClass,
  sectionGripClass,
  sectionHeaderClass,
  sectionHeadingClass,
  sectionIconSize,
  sectionIconVariants,
  sectionListAddClass,
  sectionListClass,
  sectionListDescriptionClass,
  sectionListEmptyClass,
  sectionListErrorClass,
  sectionListItemsClass,
  sectionListLabelClass,
  sectionPanelClass,
  sectionProblemClass,
  sectionDetailClass,
  sectionSummaryClass,
  sectionTextClass,
  sectionTitleVariants,
  sectionTriggerClass,
  sectionVariants,
} from './SectionList.variants.js';

export interface SectionListItem {
  /** Stays with the section for as long as it exists. */
  readonly id: string;
  /** What kind of section it is: "Call to action". */
  readonly title: string;
  /** A few of its own words, so two of a kind can be told apart while closed. */
  readonly summary?: string;
  readonly icon?: LucideIcon;
  /** A word beside the title for a section in an unusual state: "Hidden". It is also shown quieter. */
  readonly tag?: string;
  /** Who else is working in the section now, as words: "Ana Ruiz". Shown beside the title. */
  readonly presence?: string;
  /** What is wrong inside the section, shown while it is closed too. */
  readonly problem?: string;
  /** The section's own fields, shown when it is open. */
  readonly content: ReactNode;
  /** What else can be done with it, in a menu: duplicate, hide, remove. */
  readonly actions: readonly MenuAction[];
}

export interface SectionListProps {
  /** What the list holds, such as "Sections". */
  readonly label: string;
  readonly description?: string;
  /** What is wrong with the list as a whole. */
  readonly errorMessage?: string;
  readonly items: readonly SectionListItem[];
  /** The ids of the sections that are open. */
  readonly openIds: readonly string[];
  readonly onOpenChange: (id: string, isOpen: boolean) => void;
  /** Shown in place of the sections when there are none. */
  readonly emptyText: string;
  /** The words on the button that adds a section. */
  readonly addLabel: string;
  readonly onAdd: () => void;
  /** Set to stop more sections being added, when the list is full. */
  readonly isFull?: boolean;
  /** Called with where a section is and where it should go, counted from 0. */
  readonly onMove: (from: number, to: number) => void;
  /** Called with a section's id and the id of the action chosen from its menu. */
  readonly onAction: (id: string, action: string) => void;
  /** The names of a section's buttons, given its place counted from 1: "Move section 2 up". */
  readonly moveUpLabel: (position: number) => string;
  readonly moveDownLabel: (position: number) => string;
  readonly moreLabel: (position: number) => string;
  /** The name of the handle a section is dragged by: "Drag section 2". */
  readonly dragLabel: (position: number) => string;
  /** A section to bring into view, when it was chosen somewhere else on the screen. */
  readonly revealId?: string | undefined;
}

/** Sections of different kinds in an order a person chooses. Each opens to show its own fields. */
export function SectionList({
  label,
  description,
  errorMessage,
  items,
  openIds,
  onOpenChange,
  emptyText,
  addLabel,
  onAdd,
  isFull = false,
  onMove,
  onAction,
  moveUpLabel,
  moveDownLabel,
  moreLabel,
  dragLabel,
  revealId,
}: SectionListProps) {
  const labelId = useId();
  const ids = items.map((item) => item.id);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (revealId === undefined) return;
    const section = [...(list.current?.children ?? [])].find((item) => item instanceof HTMLElement && item.dataset['section'] === revealId);
    // Not every browser-like place tests run in can scroll.
    if (section && typeof section.scrollIntoView === 'function') section.scrollIntoView({ block: 'nearest' });
  }, [revealId]);
  return (
    <div role="group" aria-labelledby={labelId} className={sectionListClass}>
      <span id={labelId} className={sectionListLabelClass}>
        {label}
      </span>
      {description !== undefined && <p className={sectionListDescriptionClass}>{description}</p>}
      {items.length === 0 ? (
        <p className={sectionListEmptyClass}>{emptyText}</p>
      ) : (
        <ol ref={list} className={sectionListItemsClass}>
          {items.map((item, index) => (
            <SectionRow
              key={item.id}
              item={item}
              index={index}
              ids={ids}
              isOpen={openIds.includes(item.id)}
              onOpenChange={onOpenChange}
              onMove={onMove}
              onAction={onAction}
              moveUpLabel={moveUpLabel}
              moveDownLabel={moveDownLabel}
              moreLabel={moreLabel}
              dragLabel={dragLabel}
            />
          ))}
        </ol>
      )}
      {errorMessage !== undefined && <p className={sectionListErrorClass}>{errorMessage}</p>}
      <div className={sectionListAddClass}>
        <Button variant="secondary" size="sm" icon={Plus} isDisabled={isFull} onPress={onAdd}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

/** What a dragged section is carried as. Only a section of a list like this one is taken. */
const SECTION = 'application/x-velocity-cms-section';

interface SectionRowProps extends Pick<SectionListProps, 'onOpenChange' | 'onMove' | 'onAction' | 'moveUpLabel' | 'moveDownLabel' | 'moreLabel' | 'dragLabel'> {
  readonly item: SectionListItem;
  readonly index: number;
  /** The id of every section, in order. */
  readonly ids: readonly string[];
  readonly isOpen: boolean;
}

/** One section: it is dragged by its heading, and takes a section dropped on it before or after itself. */
function SectionRow({ item, index, ids, isOpen, onOpenChange, onMove, onAction, moveUpLabel, moveDownLabel, moreLabel, dragLabel }: SectionRowProps) {
  const { id, title, summary, icon: Icon, tag, presence, problem, content, actions } = item;
  const row = useRef<HTMLLIElement>(null);
  // Where a section held over this one would land. With the keyboard there is no "where": it takes this one's place.
  const [landing, setLanding] = useState<'before' | 'after' | 'here' | null>(null);
  const { dragProps, dragButtonProps, isDragging } = useDrag({ hasDragButton: true, getItems: () => [{ [SECTION]: id }], getAllowedDropOperations: () => ['move'] });
  const { dropProps } = useDrop({
    ref: row,
    getDropOperation: (types) => (types.has(SECTION) ? 'move' : 'cancel'),
    onDropEnter: () => setLanding((current) => current ?? 'here'),
    onDropMove: (event) => setLanding(event.y < (row.current?.offsetHeight ?? 0) / 2 ? 'before' : 'after'),
    onDropExit: () => setLanding(null),
    onDrop: (event) => {
      const where = landing;
      setLanding(null);
      const [dropped] = event.items.filter(isTextDropItem);
      void dropped?.getText(SECTION).then((moved) => {
        const from = ids.indexOf(moved);
        if (from === -1) return;
        const gap = where === 'before' ? index : where === 'after' ? index + 1 : from < index ? index + 1 : index;
        const to = from < gap ? gap - 1 : gap;
        if (to !== from) onMove(from, to);
      });
    },
  });
  const tone = tag === undefined ? 'default' : 'quiet';
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  return (
    <li ref={row} data-section={id} {...dropProps}>
      {landing === 'before' && <div className={sectionDropLineClass} />}
      <Disclosure
        className={sectionVariants({ state: problem !== undefined ? 'problem' : landing === 'here' ? 'target' : isDragging ? 'dragging' : 'default' })}
        isExpanded={isOpen}
        onExpandedChange={(next) => onOpenChange(id, next)}
      >
        <div className={sectionHeaderClass} {...dragProps}>
          <AriaButton {...dragButtonProps} aria-label={dragLabel(index + 1)} className={sectionGripClass}>
            <GripVertical aria-hidden size={sectionIconSize} />
          </AriaButton>
          <Heading level={3} className={sectionHeadingClass}>
            <AriaButton slot="trigger" className={sectionTriggerClass}>
              <Chevron aria-hidden size={sectionIconSize} className={sectionChevronClass} />
              {Icon && (
                <span className={sectionIconVariants({ tone })}>
                  <Icon aria-hidden size={sectionIconSize} />
                </span>
              )}
              <span className={sectionTextClass}>
                <span className={sectionTitleVariants({ tone })}>{title}</span>
                {(tag !== undefined || summary !== undefined || presence !== undefined) && (
                  <span className={sectionDetailClass}>
                    {summary !== undefined && <span className={sectionSummaryClass}>{summary}</span>}
                    {tag !== undefined && <Tag>{tag}</Tag>}
                    {presence !== undefined && <Tag tone="info">{presence}</Tag>}
                  </span>
                )}
              </span>
            </AriaButton>
          </Heading>
          <div className={sectionActionsClass}>
            <IconButton size="sm" icon={ArrowUp} label={moveUpLabel(index + 1)} isDisabled={index === 0} onPress={() => onMove(index, index - 1)} />
            <IconButton size="sm" icon={ArrowDown} label={moveDownLabel(index + 1)} isDisabled={index === ids.length - 1} onPress={() => onMove(index, index + 1)} />
            <Menu trigger={<IconButton size="sm" icon={Ellipsis} label={moreLabel(index + 1)} />} actions={actions} onAction={(action) => onAction(id, action)} />
          </div>
        </div>
        {problem !== undefined && !isOpen && <p className={sectionProblemClass}>{problem}</p>}
        <DisclosurePanel>
          <div className={sectionPanelClass}>{content}</div>
        </DisclosurePanel>
      </Disclosure>
      {landing === 'after' && <div className={sectionDropLineClass} />}
    </li>
  );
}
