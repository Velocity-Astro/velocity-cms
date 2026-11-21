import { cva, type VariantProps } from 'class-variance-authority';

/** The card the table sits in. A table wider than the screen scrolls inside it. */
export const tableFrameClass = 'overflow-x-auto rounded-xl border border-border bg-card';

export const tableClass = 'w-full border-separate border-spacing-0 text-left text-base outline-none';

const align = {
  start: 'text-left',
  end: 'text-right',
} as const;

export const tableColumnVariants = cva(
  [
    'border-b border-border px-4 py-2.5 text-xs font-semibold whitespace-nowrap text-foreground-muted',
    'outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-inset',
    'data-allows-sorting:cursor-default data-hovered:text-foreground',
  ],
  { variants: { align }, defaultVariants: { align: 'start' } },
);

export const tableColumnLabelClass = 'inline-flex items-center gap-1';

export const tableRowClass = [
  'group outline-none transition-colors motion-fast',
  'data-hovered:bg-background-secondary data-pressed:bg-background-tertiary',
  'data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-inset',
  // A row that opens something says so to the pointer.
  'data-href:cursor-pointer data-action:cursor-pointer',
  // The row whose details stand beside the table.
  'data-selected:bg-background-tertiary',
].join(' ');

export const tableCellVariants = cva(
  'border-b border-border px-4 py-3 align-middle text-foreground outline-none group-last:border-b-0 data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-inset',
  { variants: { align }, defaultVariants: { align: 'start' } },
);

export const tableEmptyClass = 'px-4 py-12 text-center text-foreground-muted';

/** The size of the sort arrow, in pixels. */
export const tableSortIconSize = 14;

export type TableColumnVariants = VariantProps<typeof tableColumnVariants>;
