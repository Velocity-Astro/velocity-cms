import { cva } from 'class-variance-authority';

export const outlineClass = 'flex min-h-0 flex-col gap-2';
export const outlineTitleClass = 'px-2 text-xs font-semibold tracking-widest text-foreground-subtle uppercase';
export const outlineListClass = 'flex flex-col gap-0.5 outline-none';
export const outlineItemVariants = cva(
  [
    'flex min-h-9 cursor-default items-center gap-2.5 rounded-lg px-2 text-base text-foreground-secondary transition-colors motion-fast outline-none',
    'data-hovered:bg-background-secondary data-hovered:text-foreground',
    'data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-inset',
    'data-selected:bg-background-tertiary data-selected:font-semibold data-selected:text-foreground',
  ],
  {
    variants: {
      /** A section inside another is set in under it, a step for each level. */
      depth: { 0: '', 1: 'pl-6', 2: 'pl-10', 3: 'pl-14' },
    },
    defaultVariants: { depth: 0 },
  },
);
export const outlineIconClass = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground-muted';
export const outlineIconSize = 14;
export const outlineLabelClass = 'min-w-0 flex-1 truncate';
export const outlineEmptyClass = 'px-2 py-3 text-sm text-foreground-muted';
