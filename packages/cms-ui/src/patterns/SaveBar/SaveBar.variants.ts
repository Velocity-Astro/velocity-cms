import { cva } from 'class-variance-authority';

/** On a screen the bar stays at the top of the screen's panel. Across a whole window it is the window's top edge. */
export const saveBarVariants = cva('flex flex-wrap items-center gap-4 border-b border-border bg-background py-3', {
  variants: {
    across: {
      screen: 'sticky top-0 layer-sticky rounded-t-2xl px-6',
      window: 'shrink-0 px-4',
    },
  },
  defaultVariants: { across: 'screen' },
});

export const saveBarBackClass = [
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border-strong bg-background pr-3 pl-2 text-sm font-medium text-foreground',
  'transition-colors motion-fast',
  'outline-none data-hovered:bg-background-secondary data-focus-visible:ring-2 data-focus-visible:ring-ring',
].join(' ');

export const saveBarHeadingClass = 'flex min-w-0 flex-1 flex-col gap-0.5';
export const saveBarTitleClass = 'truncate text-lg font-semibold text-foreground';
export const saveBarStatusClass = 'flex min-w-0 items-center gap-2';
export const saveBarActionsClass = 'flex shrink-0 items-center gap-2';

/** The size of the arrow on the way back, in pixels. */
export const saveBarBackIconSize = 16;
