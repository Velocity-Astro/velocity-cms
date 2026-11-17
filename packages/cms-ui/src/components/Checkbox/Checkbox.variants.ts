export const checkboxClass = 'group inline-flex cursor-default items-center gap-2 text-base text-foreground data-disabled:text-foreground-muted';

export const checkboxBoxClass = [
  'flex size-4 shrink-0 items-center justify-center rounded-sm border border-input-border bg-input text-primary-foreground',
  'transition-colors motion-fast',
  'group-data-hovered:border-border-strong',
  'group-data-selected:border-primary group-data-selected:bg-primary',
  'group-data-indeterminate:border-primary group-data-indeterminate:bg-primary',
  'group-data-focus-visible:ring-2 group-data-focus-visible:ring-ring group-data-focus-visible:ring-offset-2 group-data-focus-visible:ring-offset-background',
  'group-data-disabled:opacity-50',
].join(' ');

/** The tick's size in pixels. */
export const checkboxIconSize = 12;
