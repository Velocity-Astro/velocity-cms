export const saveBarClass =
  'sticky top-0 layer-sticky flex flex-wrap items-center gap-4 border-b border-border bg-background px-6 py-3';

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
