import { cva, type VariantProps } from 'class-variance-authority';

/** The columns side by side. A board wider than its place scrolls sideways, on its own. */
export const boardClass = 'flex min-w-0 items-start gap-3 overflow-x-auto pb-2';

export const boardColumnVariants = cva('flex min-w-48 flex-1 basis-0 flex-col gap-2 rounded-lg border bg-background-secondary p-2 transition-colors motion-fast', {
  variants: {
    state: {
      default: 'border-border',
      /** A card is held over it, and would land here. */
      target: 'border-ring ring-2 ring-ring',
    },
  },
  defaultVariants: { state: 'default' },
});

export const boardColumnHeaderClass = 'flex items-center justify-between gap-2 px-1 pt-1';
export const boardColumnTitleClass = 'flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground';
export const boardColumnNameClass = 'truncate';
export const boardColumnCountClass = 'shrink-0 text-sm text-foreground-muted';

/** The mark before a column's name: whether the matter is still open there, won or lost. */
export const boardDotVariants = cva('size-2 shrink-0 rounded-full', {
  variants: {
    tone: {
      neutral: 'bg-foreground-subtle',
      success: 'bg-success',
      danger: 'bg-destructive',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export const boardItemsClass = 'flex flex-col gap-2';
export const boardEmptyClass = 'rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-foreground-muted';
export const boardMoreClass = 'px-1 text-sm text-foreground-muted';

export const boardCardVariants = cva('motion-rise flex min-w-0 items-start gap-1 rounded-md border border-border bg-card p-1 shadow-sm', {
  variants: {
    state: {
      default: '',
      /** Being dragged: it stays in its place, faded, until it is dropped. */
      dragging: 'opacity-50',
    },
  },
  defaultVariants: { state: 'default' },
});

export const boardCardOpenClass = [
  'flex min-w-0 flex-1 cursor-grab flex-col gap-1 rounded-sm px-2 py-1 text-left outline-none',
  'transition-colors motion-fast data-hovered:bg-secondary data-pressed:cursor-grabbing',
  'data-focus-visible:ring-2 data-focus-visible:ring-input-focus',
].join(' ');
export const boardCardTitleClass = 'truncate text-sm font-medium text-foreground';
export const boardCardDetailClass = 'truncate text-sm text-foreground-muted';
export const boardCardNotesClass = 'flex flex-wrap items-center gap-1 pt-1';

/** The size of a card's icons, in pixels. */
export const boardIconSize = 16;

export type BoardColumnVariants = VariantProps<typeof boardColumnVariants>;
