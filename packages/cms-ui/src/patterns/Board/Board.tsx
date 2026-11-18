import { ArrowRightLeft } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button as AriaButton, isTextDropItem, useDrag, useDrop } from 'react-aria-components';
import { IconButton } from '../../components/IconButton/index.js';
import { Menu } from '../../components/Menu/index.js';
import { Tag } from '../../components/Tag/index.js';
import {
  boardCardDetailClass,
  boardCardNotesClass,
  boardCardOpenClass,
  boardCardTitleClass,
  boardCardVariants,
  boardClass,
  boardColumnCountClass,
  boardColumnHeaderClass,
  boardColumnNameClass,
  boardColumnTitleClass,
  boardColumnVariants,
  boardDotVariants,
  boardEmptyClass,
  boardItemsClass,
  boardMoreClass,
} from './Board.variants.js';

export interface BoardItem {
  /** What `onOpen` and `onMove` are called with. */
  readonly id: string;
  /** What the card is called: a person's name. */
  readonly title: string;
  /** A line under the title: their email. */
  readonly detail?: string;
  /** Short facts under that, each in a tag: who looks after it, when it is due. */
  readonly notes?: readonly BoardNote[];
}

export interface BoardNote {
  readonly text: string;
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}

export interface BoardColumn {
  readonly id: string;
  /** What the column is called: "Contacted". */
  readonly title: string;
  /** How many it holds, as it is to be read: "12". It can be more than the cards shown. */
  readonly count: string;
  /** The mark before the title: `success` where a matter ended well, `danger` where it did not. */
  readonly tone?: 'neutral' | 'success' | 'danger';
  readonly items: readonly BoardItem[];
  /** Said under the cards when the column holds more than it shows: "8 more". */
  readonly more?: string;
}

export interface BoardProps {
  /** Names the board for screen readers, such as "Pipeline". */
  readonly label: string;
  readonly columns: readonly BoardColumn[];
  /** Shown in a column that holds nothing. */
  readonly emptyText: string;
  /** Called with the id of the card that was opened: a press, or Enter. */
  readonly onOpen: (id: string) => void;
  /** Called with a card's id and the id of the column it was put in. Never called for the column it is already in. */
  readonly onMove: (id: string, columnId: string) => void;
  /** The name of the button that moves a card without dragging it, given the card's title: "Move Ana Ruiz". */
  readonly moveLabel: (title: string) => string;
}

/** What a dragged card is carried as. Only a card of a board like this one is taken. */
const CARD = 'application/x-velocity-cms-board-card';

/** Columns of cards, where a card is dragged from one column to another. Each card also has a menu that moves it. */
export function Board({ label, columns, emptyText, onOpen, onMove, moveLabel }: BoardProps) {
  const places = new Map(columns.flatMap((column) => column.items.map((item) => [item.id, column.id] as const)));
  const move = (id: string, columnId: string) => {
    if (places.get(id) !== columnId) onMove(id, columnId);
  };
  return (
    <div role="group" aria-label={label} className={boardClass}>
      {columns.map((column) => (
        <Column key={column.id} column={column} columns={columns} emptyText={emptyText} onOpen={onOpen} onMove={move} moveLabel={moveLabel} />
      ))}
    </div>
  );
}

interface ColumnProps extends Pick<BoardProps, 'columns' | 'emptyText' | 'onOpen' | 'onMove' | 'moveLabel'> {
  readonly column: BoardColumn;
}

/** One column: it takes a card dropped anywhere on it. */
function Column({ column, columns, emptyText, onOpen, onMove, moveLabel }: ColumnProps) {
  const titleId = useId();
  const place = useRef<HTMLElement>(null);
  const [isTarget, setTarget] = useState(false);
  const { dropProps } = useDrop({
    ref: place,
    getDropOperation: (types) => (types.has(CARD) ? 'move' : 'cancel'),
    onDropEnter: () => setTarget(true),
    onDropExit: () => setTarget(false),
    onDrop: (event) => {
      setTarget(false);
      const [dropped] = event.items.filter(isTextDropItem);
      void dropped?.getText(CARD).then((id) => onMove(id, column.id));
    },
  });
  const elsewhere = columns.filter((other) => other.id !== column.id).map((other) => ({ id: other.id, label: other.title }));
  return (
    <section ref={place} aria-labelledby={titleId} className={boardColumnVariants({ state: isTarget ? 'target' : 'default' })} {...dropProps}>
      <div className={boardColumnHeaderClass}>
        <h3 id={titleId} className={boardColumnTitleClass}>
          <span className={boardDotVariants({ tone: column.tone })} />
          <span className={boardColumnNameClass}>{column.title}</span>
        </h3>
        <span className={boardColumnCountClass}>{column.count}</span>
      </div>
      {column.items.length === 0 ? (
        <p className={boardEmptyClass}>{emptyText}</p>
      ) : (
        <ul className={boardItemsClass}>
          {column.items.map((item) => (
            <Card key={item.id} item={item} elsewhere={elsewhere} onOpen={onOpen} onMove={onMove} moveLabel={moveLabel} />
          ))}
        </ul>
      )}
      {column.more !== undefined && <p className={boardMoreClass}>{column.more}</p>}
    </section>
  );
}

interface CardProps extends Pick<BoardProps, 'onOpen' | 'onMove' | 'moveLabel'> {
  readonly item: BoardItem;
  /** The other columns, for the menu that moves the card. */
  readonly elsewhere: readonly { readonly id: string; readonly label: string }[];
}

/** One card: pressed it opens, dragged it moves, and its menu moves it for whoever does not drag. */
function Card({ item, elsewhere, onOpen, onMove, moveLabel }: CardProps) {
  const { dragProps, isDragging } = useDrag({ getItems: () => [{ [CARD]: item.id }], getAllowedDropOperations: () => ['move'] });
  return (
    <li className={boardCardVariants({ state: isDragging ? 'dragging' : 'default' })} {...dragProps}>
      <AriaButton className={boardCardOpenClass} onPress={() => onOpen(item.id)}>
        <span className={boardCardTitleClass}>{item.title}</span>
        {item.detail !== undefined && <span className={boardCardDetailClass}>{item.detail}</span>}
        {item.notes !== undefined && item.notes.length > 0 && (
          <span className={boardCardNotesClass}>
            {item.notes.map((note) => (
              <Tag key={note.text} tone={note.tone ?? 'neutral'}>
                {note.text}
              </Tag>
            ))}
          </span>
        )}
      </AriaButton>
      {elsewhere.length > 0 && (
        <Menu trigger={<IconButton size="sm" icon={ArrowRightLeft} label={moveLabel(item.title)} />} actions={elsewhere} onAction={(columnId) => onMove(item.id, columnId)} />
      )}
    </li>
  );
}
