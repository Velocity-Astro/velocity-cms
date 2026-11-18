import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Ellipsis, Plus, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button as AriaButton, Disclosure, DisclosurePanel, Heading } from 'react-aria-components';
import { Button } from '../../components/Button/index.js';
import { IconButton } from '../../components/IconButton/index.js';
import { Menu, type MenuAction } from '../../components/Menu/index.js';
import { Tag } from '../../components/Tag/index.js';
import {
  sectionActionsClass,
  sectionChevronClass,
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
}: SectionListProps) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className={sectionListClass}>
      <span id={labelId} className={sectionListLabelClass}>
        {label}
      </span>
      {description !== undefined && <p className={sectionListDescriptionClass}>{description}</p>}
      {items.length === 0 ? (
        <p className={sectionListEmptyClass}>{emptyText}</p>
      ) : (
        <ol className={sectionListItemsClass}>
          {items.map(({ id, title, summary, icon: Icon, tag, problem, content, actions }, index) => {
            const isOpen = openIds.includes(id);
            const tone = tag === undefined ? 'default' : 'quiet';
            const Chevron = isOpen ? ChevronDown : ChevronRight;
            return (
              <li key={id}>
                <Disclosure className={sectionVariants({ state: problem === undefined ? 'default' : 'problem' })} isExpanded={isOpen} onExpandedChange={(next) => onOpenChange(id, next)}>
                  <div className={sectionHeaderClass}>
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
                          {summary !== undefined && <span className={sectionSummaryClass}>{summary}</span>}
                        </span>
                        {tag !== undefined && <Tag>{tag}</Tag>}
                      </AriaButton>
                    </Heading>
                    <div className={sectionActionsClass}>
                      <IconButton size="sm" icon={ArrowUp} label={moveUpLabel(index + 1)} isDisabled={index === 0} onPress={() => onMove(index, index - 1)} />
                      <IconButton size="sm" icon={ArrowDown} label={moveDownLabel(index + 1)} isDisabled={index === items.length - 1} onPress={() => onMove(index, index + 1)} />
                      <Menu trigger={<IconButton size="sm" icon={Ellipsis} label={moreLabel(index + 1)} />} actions={actions} onAction={(action) => onAction(id, action)} />
                    </div>
                  </div>
                  {problem !== undefined && !isOpen && <p className={sectionProblemClass}>{problem}</p>}
                  <DisclosurePanel>
                    <div className={sectionPanelClass}>{content}</div>
                  </DisclosurePanel>
                </Disclosure>
              </li>
            );
          })}
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
