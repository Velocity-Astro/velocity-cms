import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";
import {
  Cell,
  Column,
  Row,
  Table as AriaTable,
  TableBody,
  TableHeader,
} from "react-aria-components";
import {
  tableCellVariants,
  tableClass,
  tableColumnLabelClass,
  tableColumnVariants,
  tableEmptyClass,
  tableFrameClass,
  tableRowClass,
  tableSortIconSize,
} from "./Table.variants.js";

export interface TableColumn {
  readonly id: string;
  /** The column's heading. */
  readonly label: string;
  /** `end` for numbers and amounts, so their digits line up. */
  readonly align?: "start" | "end";
  readonly isSortable?: boolean;
}

export interface TableRow {
  readonly id: string;
  /** What to show in each column, by column id. */
  readonly cells: Readonly<Record<string, ReactNode>>;
}

export interface TableSort {
  readonly column: string;
  readonly direction: "ascending" | "descending";
}

export interface TableProps {
  /** Names the table for screen readers, such as "Listings". */
  readonly label: string;
  /** The first column names each row. */
  readonly columns: readonly TableColumn[];
  readonly rows: readonly TableRow[];
  /** Called when a row is pressed or Enter is pressed on it. With `onSelect`, a press chooses the row and a second one opens it. */
  readonly onRowAction?: (id: string) => void;
  /** The row that is chosen, such as the one whose details stand beside the table. */
  readonly selectedId?: string | null;
  /**
   * Called when a row is chosen: pressed once, or reached with the arrow keys. Enter or a second
   * press then opens it (`onRowAction`). On a touch screen a tap still opens it.
   */
  readonly onSelect?: (id: string) => void;
  /** How the rows are sorted. The table shows it; the screen does the sorting. */
  readonly sort?: TableSort;
  readonly onSortChange?: (sort: TableSort) => void;
  /** Shown instead of rows when there are none. */
  readonly empty?: ReactNode;
}

/** Rows of the same kind of thing, with a heading for each column. */
export function Table({
  label,
  columns,
  rows,
  onRowAction,
  selectedId,
  onSelect,
  sort,
  onSortChange,
  empty,
}: TableProps) {
  return (
    <div className={tableFrameClass}>
      <AriaTable
        aria-label={label}
        className={tableClass}
        {...(sort && { sortDescriptor: sort })}
        {...(onSortChange && {
          onSortChange: (next) =>
            onSortChange({
              column: String(next.column),
              direction: next.direction,
            }),
        })}
        {...(onRowAction && { onRowAction: (key) => onRowAction(String(key)) })}
        {...(onSelect && {
          selectionMode: 'single' as const,
          selectionBehavior: 'replace' as const,
          disallowEmptySelection: true,
          selectedKeys: selectedId === undefined || selectedId === null ? [] : [selectedId],
          onSelectionChange: (keys) => {
            if (keys === 'all') return;
            const [first] = [...keys];
            if (first !== undefined) onSelect(String(first));
          },
        })}
      >
        <TableHeader>
          {columns.map((column, index) => (
            <Column
              key={column.id}
              id={column.id}
              className={tableColumnVariants({ align: column.align })}
              isRowHeader={index === 0}
              allowsSorting={column.isSortable ?? false}
              textValue={column.label}
            >
              {(state) => (
                <span className={tableColumnLabelClass}>
                  {column.label}
                  {state.sortDirection === "ascending" && (
                    <ArrowUp aria-hidden size={tableSortIconSize} />
                  )}
                  {state.sortDirection === "descending" && (
                    <ArrowDown aria-hidden size={tableSortIconSize} />
                  )}
                </span>
              )}
            </Column>
          ))}
        </TableHeader>
        <TableBody
          renderEmptyState={() => (
            <div className={tableEmptyClass}>{empty}</div>
          )}
        >
          {rows.map((row) => (
            <Row key={row.id} id={row.id} className={tableRowClass}>
              {columns.map((column) => (
                <Cell
                  key={column.id}
                  className={tableCellVariants({ align: column.align })}
                >
                  {row.cells[column.id]}
                </Cell>
              ))}
            </Row>
          ))}
        </TableBody>
      </AriaTable>
    </div>
  );
}
