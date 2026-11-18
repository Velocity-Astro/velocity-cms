import { GridList, GridListItem } from 'react-aria-components';
import {
  mediaGridClass,
  mediaGridEmptyClass,
  mediaGridImageClass,
  mediaGridItemClass,
  mediaGridNameClass,
  mediaGridNoteClass,
  mediaGridTextClass,
} from './MediaGrid.variants.js';

export interface MediaGridItem {
  /** What `onAction` is called with. */
  readonly id: string;
  /** What the picture is called, shown under it. */
  readonly name: string;
  /** Where a small copy of it loads from. */
  readonly url: string;
  /** A line under the name, such as its size: "1600 × 900". */
  readonly note?: string;
}

export interface MediaGridProps {
  /** Names the grid for screen readers, such as "Photos". */
  readonly label: string;
  readonly items: readonly MediaGridItem[];
  /** Called with the id of the picture that was opened: a press, or Enter. */
  readonly onAction: (id: string) => void;
  /** Shown when there are no pictures, such as "No photos match." */
  readonly emptyText: string;
}

/** A library of pictures to look through. Arrow keys move between them, and opening one says which. */
export function MediaGrid({ label, items, onAction, emptyText }: MediaGridProps) {
  return (
    <GridList
      aria-label={label}
      layout="grid"
      onAction={(key) => onAction(String(key))}
      renderEmptyState={() => <p className={mediaGridEmptyClass}>{emptyText}</p>}
      className={mediaGridClass}
    >
      {items.map((item) => (
        <GridListItem key={item.id} id={item.id} textValue={item.name} className={mediaGridItemClass}>
          <img src={item.url} alt="" loading="lazy" className={mediaGridImageClass} />
          <span className={mediaGridTextClass}>
            <span className={mediaGridNameClass}>{item.name}</span>
            {item.note !== undefined && <span className={mediaGridNoteClass}>{item.note}</span>}
          </span>
        </GridListItem>
      ))}
    </GridList>
  );
}
