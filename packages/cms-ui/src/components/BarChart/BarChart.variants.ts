import { cva } from 'class-variance-authority';

/**
 * Bars drawn with sizes from the theme: the length of a bar goes in twentieths of its track, so it is
 * always a step of the scale. The one bar a chart sets apart (today, say) is in the brand colour,
 * the one orange of a screen; the rest are quieter, in the text colour.
 */
export const barChartClass = 'flex w-full flex-col gap-3';

/* --- Columns: one per day, or per short label ------------------------------ */
export const barChartColumnsClass = 'flex h-40 w-full items-end gap-1.5';
export const barChartColumnClass = 'flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5';
/** A day with nothing still shows where its bar would stand, on the line along the foot. */
export const barChartColumnTrackClass = 'flex w-full flex-1 items-end border-b border-border';
export const barChartColumnBarVariants = cva('w-full rounded-t-sm transition-all motion-slide', {
  variants: {
    step: {
      0: 'h-0',
      1: 'h-1/20',
      2: 'h-2/20',
      3: 'h-3/20',
      4: 'h-4/20',
      5: 'h-5/20',
      6: 'h-6/20',
      7: 'h-7/20',
      8: 'h-8/20',
      9: 'h-9/20',
      10: 'h-10/20',
      11: 'h-11/20',
      12: 'h-12/20',
      13: 'h-13/20',
      14: 'h-14/20',
      15: 'h-15/20',
      16: 'h-16/20',
      17: 'h-17/20',
      18: 'h-18/20',
      19: 'h-19/20',
      20: 'h-full',
    },
    isHighlighted: { true: 'bg-brand-fill', false: 'bg-foreground-subtle' },
  },
  defaultVariants: { step: 0, isHighlighted: false },
});
export const barChartColumnLabelClass = 'w-full truncate text-center text-xs text-foreground-muted';

/* --- Rows: one per named thing, its label on the left ----------------------- */
export const barChartRowsClass = 'flex w-full flex-col gap-3';
export const barChartRowClass = 'grid grid-cols-3 items-center gap-3';
export const barChartRowLabelClass = 'truncate text-sm text-foreground-secondary';
export const barChartRowTrackClass = 'col-span-2 flex items-center gap-3';
export const barChartRowBarHolderClass = 'flex h-2.5 min-w-0 flex-1 rounded-full bg-background-tertiary';
export const barChartRowBarVariants = cva('h-full rounded-full transition-all motion-slide', {
  variants: {
    step: {
      0: 'w-0',
      1: 'w-1/20',
      2: 'w-2/20',
      3: 'w-3/20',
      4: 'w-4/20',
      5: 'w-5/20',
      6: 'w-6/20',
      7: 'w-7/20',
      8: 'w-8/20',
      9: 'w-9/20',
      10: 'w-10/20',
      11: 'w-11/20',
      12: 'w-12/20',
      13: 'w-13/20',
      14: 'w-14/20',
      15: 'w-15/20',
      16: 'w-16/20',
      17: 'w-17/20',
      18: 'w-18/20',
      19: 'w-19/20',
      20: 'w-full',
    },
    isHighlighted: { true: 'bg-brand-fill', false: 'bg-foreground-subtle' },
  },
  defaultVariants: { step: 0, isHighlighted: false },
});
export const barChartRowValueClass = 'w-20 shrink-0 text-right text-sm font-semibold text-foreground tabular-nums';

/** What the chart shows, said as a list for screen readers: the bars are only a picture of it. */
export const barChartListClass = 'sr-only';

export type BarStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;
