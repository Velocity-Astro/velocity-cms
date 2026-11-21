import { cva } from 'class-variance-authority';

/**
 * On a screen the bar stays at the top of the screen. Inside `AppShell` it is drawn in the shell's own
 * bar, which already stays. Across a whole window it is the window's top edge.
 * The buttons go under the title when the window has no room for them beside it, and never off its edge.
 * In the shell on a phone its parts are the shell bar's own: the way back and the title between the menu and
 * the search, the buttons on a row of their own under them, at its end.
 */
export const saveBarVariants = cva('flex-wrap items-center gap-x-4 gap-y-2', {
  variants: {
    across: {
      screen: 'sticky top-0 layer-sticky flex border-b border-border bg-background px-4 py-3 md:px-6',
      shell: 'contents md:flex md:min-w-0 md:flex-1 md:flex-nowrap md:py-2',
      section: 'sticky top-0 layer-sticky flex border-b border-border bg-background px-4 py-3 md:px-6',
      window: 'flex shrink-0 gap-x-2 border-b border-border bg-background px-3 py-2 md:flex-nowrap md:gap-x-4',
    },
  },
  defaultVariants: { across: 'screen' },
});

/** On a phone the way back is its arrow alone, and its words are read out. */
export const saveBarBackClass = [
  'order-2 inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-background text-sm font-medium text-foreground md:order-none',
  'w-8 md:w-auto md:pr-3 md:pl-2',
  'transition-colors motion-fast',
  'outline-none data-hovered:bg-background-secondary data-focus-visible:ring-2 data-focus-visible:ring-ring',
].join(' ');

export const saveBarBackLabelClass = 'sr-only md:not-sr-only';

/**
 * With something in the middle of the bar, the heading keeps to its words and the middle takes the room.
 * On a phone it takes what the row leaves, and the buttons go to the row under it.
 */
export const saveBarHeadingVariants = cva('order-2 flex min-w-0 flex-col gap-0.5 md:order-none', {
  variants: { hasCenter: { true: 'flex-1 md:flex-none md:shrink', false: 'flex-1 basis-0 md:basis-48' } },
  defaultVariants: { hasCenter: false },
});
/** In the middle of the bar, from `md` up: the controls of what is shown, such as the widths of a page. */
export const saveBarCenterClass = 'hidden min-w-0 flex-1 items-center justify-center md:flex';
export const saveBarTitleClass = 'truncate text-lg font-semibold text-foreground md:text-xl';
export const saveBarStatusClass = 'flex min-w-0 items-center gap-2 whitespace-nowrap';
/** On a phone the buttons are a row of their own across the bar, the main one at its end. */
export const saveBarActionsClass = 'order-4 flex w-full max-w-full shrink-0 flex-wrap items-center justify-end gap-1 md:order-none md:w-auto md:gap-2';

/** The size of the arrow on the way back, in pixels. */
export const saveBarBackIconSize = 16;
