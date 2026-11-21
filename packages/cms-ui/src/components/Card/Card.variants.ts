import { cva } from 'class-variance-authority';

export const cardClass = 'flex min-w-0 flex-col rounded-xl border border-border bg-card';
export const cardHeaderClass = 'flex items-start justify-between gap-4 border-b border-border px-6 py-4';
export const cardHeadingClass = 'flex min-w-0 flex-col gap-1';
export const cardTitleClass = 'font-display text-lg font-semibold text-foreground';
export const cardDescriptionClass = 'text-sm text-foreground-muted';
export const cardActionsClass = 'flex shrink-0 items-center gap-3';
/** Flush, what the card holds runs to its edges: a table or a list of rows, which have their own spacing. */
export const cardBodyVariants = cva('flex flex-1 flex-col', {
  variants: { isFlush: { true: '', false: 'gap-5 p-6' } },
  defaultVariants: { isFlush: false },
});
export const cardFooterClass = 'flex flex-wrap items-center gap-2 border-t border-border px-6 py-3';
