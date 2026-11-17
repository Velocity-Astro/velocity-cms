import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button } from '../../components/Button/index.js';
import { IconButton } from '../../components/IconButton/index.js';
import {
  repeaterAddClass,
  repeaterClass,
  repeaterDescriptionClass,
  repeaterEmptyClass,
  repeaterErrorClass,
  repeaterItemActionsClass,
  repeaterItemClass,
  repeaterItemContentClass,
  repeaterLabelClass,
  repeaterListClass,
} from './Repeater.variants.js';

export interface RepeaterItem {
  /** Stays with the item while the list is open. */
  readonly id: string;
  /** The item's own fields. */
  readonly content: ReactNode;
}

export interface RepeaterProps {
  /** What the list holds, such as "Photos". */
  readonly label: string;
  /** Help for the whole list. */
  readonly description?: string;
  /** What is wrong with the list as a whole. */
  readonly errorMessage?: string;
  readonly items: readonly RepeaterItem[];
  /** Shown in place of the items when there are none, such as "No photos yet". */
  readonly emptyText: string;
  /** The words on the button that adds an item, such as "Add photo". */
  readonly addLabel: string;
  readonly onAdd: () => void;
  /** Called with the place of the item to take out, counted from 0. */
  readonly onRemove: (index: number) => void;
  /** Called with where an item is and where it should go, counted from 0. */
  readonly onMove: (from: number, to: number) => void;
  /** The names of an item's buttons, given its place counted from 1: "Remove photo 2". */
  readonly removeLabel: (position: number) => string;
  readonly moveUpLabel: (position: number) => string;
  readonly moveDownLabel: (position: number) => string;
  /** Set to stop more items being added, when the list is full. */
  readonly isFull?: boolean;
}

/** A list a person builds: add an item, fill it in, put the items in order, take one out. */
export function Repeater({
  label,
  description,
  errorMessage,
  items,
  emptyText,
  addLabel,
  onAdd,
  onRemove,
  onMove,
  removeLabel,
  moveUpLabel,
  moveDownLabel,
  isFull = false,
}: RepeaterProps) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className={repeaterClass}>
      <span id={labelId} className={repeaterLabelClass}>
        {label}
      </span>
      {description !== undefined && <p className={repeaterDescriptionClass}>{description}</p>}
      {items.length === 0 ? (
        <p className={repeaterEmptyClass}>{emptyText}</p>
      ) : (
        <ol className={repeaterListClass}>
          {items.map((item, index) => (
            <li key={item.id} className={repeaterItemClass}>
              <div className={repeaterItemContentClass}>{item.content}</div>
              <div className={repeaterItemActionsClass}>
                <IconButton size="sm" icon={ArrowUp} label={moveUpLabel(index + 1)} isDisabled={index === 0} onPress={() => onMove(index, index - 1)} />
                <IconButton
                  size="sm"
                  icon={ArrowDown}
                  label={moveDownLabel(index + 1)}
                  isDisabled={index === items.length - 1}
                  onPress={() => onMove(index, index + 1)}
                />
                <IconButton size="sm" icon={Trash2} label={removeLabel(index + 1)} onPress={() => onRemove(index)} />
              </div>
            </li>
          ))}
        </ol>
      )}
      {errorMessage !== undefined && <p className={repeaterErrorClass}>{errorMessage}</p>}
      <div className={repeaterAddClass}>
        <Button variant="secondary" size="sm" icon={Plus} isDisabled={isFull} onPress={onAdd}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
