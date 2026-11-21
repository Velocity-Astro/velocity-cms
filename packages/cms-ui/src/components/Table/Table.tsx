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
  tableFrameVariants,
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
  /**
   * Left out on a narrow window (below `md`), where there is room for the main columns only.
   * Never the first column, which names each row.
   */
  readonly isSecondary?: boolean;
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
  /** Called when a row is pressed or Enter is pressed on it. */
  readonly onRowAction?: (id: string) => void;
  /** How the rows are sorted. The table shows it; the screen does the sorting. */
  readonly sort?: TableSort;
  readonly onSortChange?: (sort: TableSort) => void;
  /** Shown instead of rows when there are none. */
  readonly empty?: ReactNode;
  /** `none` inside a `Card` with `isFlush`, which frames it already. */
  readonly frame?: 'card' | 'none';
}

/** Rows of the same kind of thing, with a heading for each column. */
export function Table({
  label,
  columns,
  rows,
  onRowAction,
  sort,
  onSortChange,
  empty,
  frame = 'card',
}: TableProps) {
  return (
    <div className={tableFrameVariants({ frame })}>
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
      >
        <TableHeader>
          {columns.map((column, index) => (
            <Column
              key={column.id}
              id={column.id}
              className={tableColumnVariants({ align: column.align, isSecondary: index > 0 && column.isSecondary === true })}
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
              {columns.map((column, index) => (
                <Cell
                  key={column.id}
                  className={tableCellVariants({ align: column.align, isSecondary: index > 0 && column.isSecondary === true })}
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
