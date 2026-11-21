import { cva } from 'class-variance-authority';

/**
 * On a screen the bar stays at the top of the screen. Inside `AppShell` it is drawn in the shell's own
 * bar, which already stays. Across a whole window it is the window's top edge.
 * The buttons go under the title when the window has no room for them beside it, and never off its edge.
 */
export const saveBarVariants = cva('flex flex-wrap items-center gap-x-4 gap-y-2', {
  variants: {
    across: {
      screen: 'sticky top-0 layer-sticky border-b border-border bg-background px-4 py-3 md:px-6',
      shell: 'min-w-0 flex-1 py-2 md:flex-nowrap',
      section: 'sticky top-0 layer-sticky border-b border-border bg-background px-4 py-3 md:px-6',
      window: 'shrink-0 border-b border-border bg-background px-3 py-2 md:flex-nowrap',
    },
  },
  defaultVariants: { across: 'screen' },
});

export const saveBarBackClass = [
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border-strong bg-background pr-3 pl-2 text-sm font-medium text-foreground',
  'transition-colors motion-fast',
  'outline-none data-hovered:bg-background-secondary data-focus-visible:ring-2 data-focus-visible:ring-ring',
].join(' ');

/** With something in the middle of the bar, the heading keeps to its words and the middle takes the room. */
export const saveBarHeadingVariants = cva('flex min-w-0 flex-col gap-0.5', {
  variants: { hasCenter: { true: 'shrink', false: 'flex-1 basis-48' } },
  defaultVariants: { hasCenter: false },
});
/** In the middle of the bar, from `md` up: the controls of what is shown, such as the widths of a page. */
export const saveBarCenterClass = 'hidden min-w-0 flex-1 items-center justify-center md:flex';
export const saveBarTitleClass = 'truncate text-xl font-semibold text-foreground';
export const saveBarStatusClass = 'flex min-w-0 items-center gap-2 whitespace-nowrap';
export const saveBarActionsClass = 'flex max-w-full shrink-0 flex-wrap items-center gap-2';

/** The size of the arrow on the way back, in pixels. */
export const saveBarBackIconSize = 16;
