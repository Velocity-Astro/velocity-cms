import { cva, type VariantProps } from 'class-variance-authority';

export const tableClass = 'w-full border-separate border-spacing-0 text-left text-base outline-none';

const align = {
  start: 'text-left',
  end: 'text-right',
} as const;

export const tableColumnVariants = cva(
  [
    'border-b border-border px-3 py-2 text-sm font-medium whitespace-nowrap text-foreground-secondary',
    'outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-inset',
    'data-allows-sorting:cursor-default data-hovered:text-foreground',
  ],
  { variants: { align }, defaultVariants: { align: 'start' } },
);

export const tableColumnLabelClass = 'inline-flex items-center gap-1';

export const tableRowClass = [
  'outline-none transition-colors motion-fast',
  'data-hovered:bg-background-secondary data-pressed:bg-background-tertiary',
  'data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-inset',
  'data-href:cursor-default data-action:cursor-default',
].join(' ');

export const tableCellVariants = cva(
  'border-b border-border-subtle px-3 py-3 text-foreground outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-inset',
  { variants: { align }, defaultVariants: { align: 'start' } },
);

export const tableEmptyClass = 'px-3 py-12 text-center text-foreground-muted';

/** The size of the sort arrow, in pixels. */
export const tableSortIconSize = 14;

export type TableColumnVariants = VariantProps<typeof tableColumnVariants>;
