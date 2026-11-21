import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { ListBox, ListBoxItem } from 'react-aria-components';
import {
  outlineClass,
  outlineEmptyClass,
  outlineIconClass,
  outlineIconSize,
  outlineItemVariants,
  outlineLabelClass,
  outlineListClass,
  outlineTitleClass,
} from './Outline.variants.js';

export interface OutlineItem {
  readonly id: string;
  /** What it is called: "Page opening", "Text". */
  readonly label: string;
  /** How far inside other items it is: 0 at the top, at most 3. */
  readonly depth?: 0 | 1 | 2 | 3;
  readonly icon?: LucideIcon;
}

export interface OutlineProps {
  /** Over the list, and its name for screen readers: "Sections". */
  readonly title: string;
  readonly items: readonly OutlineItem[];
  /** The one being looked at. */
  readonly currentId?: string;
  /** Called when one is chosen, with a press or with Enter. */
  readonly onChoose: (id: string) => void;
  /** Shown when there is nothing to list. */
  readonly emptyText: string;
}

/**
 * The parts of something long, by name, in order: the sections of a page. Choosing one goes to it.
 * It is a way around, not a way to change: what is chosen is edited where it is.
 */
export function Outline({ title, items, currentId, onChoose, emptyText }: OutlineProps) {
  const titleId = useId();
  return (
    <div className={outlineClass}>
      <div id={titleId} className={outlineTitleClass}>
        {title}
      </div>
      <ListBox
        aria-labelledby={titleId}
        className={outlineListClass}
        items={items}
        selectionMode="single"
        selectedKeys={currentId === undefined ? [] : [currentId]}
        onSelectionChange={(keys) => {
          if (keys === 'all') return;
          const [first] = [...keys];
          // Pressing the one already chosen would let it go: it is chosen again instead, so it is gone to.
          const chosen = first === undefined ? currentId : String(first);
          if (chosen !== undefined) onChoose(chosen);
        }}
        renderEmptyState={() => <div className={outlineEmptyClass}>{emptyText}</div>}
      >
        {({ id, label, depth = 0, icon: Icon }) => (
          <ListBoxItem id={id} textValue={label} className={outlineItemVariants({ depth })}>
            {Icon && (
              <span aria-hidden className={outlineIconClass}>
                <Icon size={outlineIconSize} />
              </span>
            )}
            <span className={outlineLabelClass}>{label}</span>
          </ListBoxItem>
        )}
      </ListBox>
    </div>
  );
}
