import { cva } from 'class-variance-authority';

/**
 * On a screen the bar stays at the top of the screen. Inside `AppShell` it is drawn in the shell's own
 * bar, which already stays. Across a whole window it is the window's top edge.
 * In the shell's bar and across a window it is one row, as on any phone: the way back, the title cut to fit,
 * and buttons few enough to fit (a screen folds the rest into its menu there). On its own in a screen the
 * buttons go under the title when the window has no room for them beside it, and never off its edge.
 */
export const saveBarVariants = cva('flex items-center', {
  variants: {
    across: {
      screen: 'sticky top-0 layer-sticky flex-wrap gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-3 md:px-6',
      shell: 'min-w-0 flex-1 gap-2 py-2 md:gap-4',
      section: 'sticky top-0 layer-sticky flex-wrap gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-3 md:px-6',
      window: 'shrink-0 gap-2 border-b border-border bg-card px-3 py-2 md:gap-4',
    },
  },
  defaultVariants: { across: 'screen' },
});

/** On a phone the way back is its arrow alone, and its words are read out. */
export const saveBarBackClass = [
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-background text-sm font-medium text-foreground',
  'w-8 md:w-auto md:pr-3 md:pl-2',
  'transition-colors motion-fast',
  'outline-none data-hovered:bg-background-secondary data-focus-visible:ring-2 data-focus-visible:ring-ring',
].join(' ');

export const saveBarBackLabelClass = 'sr-only md:not-sr-only';

/**
 * The title and its status on one row: the title is cut to fit, the status keeps its words. With something in
 * the middle of the bar, the heading keeps to its words and the middle takes the room.
 */
export const saveBarHeadingVariants = cva('flex min-w-0 items-center gap-3', {
  variants: { hasCenter: { true: 'flex-1 md:flex-none md:shrink', false: 'flex-1 basis-0 md:basis-48' } },
  defaultVariants: { hasCenter: false },
});
/** In the middle of the bar, from `md` up: the controls of what is shown, such as the widths of a page. */
export const saveBarCenterClass = 'hidden min-w-0 flex-1 items-center justify-center md:flex';
export const saveBarTitleClass = 'min-w-0 truncate text-lg font-semibold text-foreground';
export const saveBarStatusClass = 'flex shrink-0 items-center gap-2 whitespace-nowrap';
/** The words after the status: from `lg` up, where the row has room. */
export const saveBarNoteClass = 'sr-only text-sm text-foreground-muted lg:not-sr-only';
/** The buttons, the main one last. */
export const saveBarActionsClass = 'flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1 md:gap-2';

/** The size of the arrow on the way back, in pixels. */
export const saveBarBackIconSize = 16;
