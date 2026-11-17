export const switchClass = 'group inline-flex cursor-default items-center gap-2 text-base text-foreground data-disabled:text-foreground-muted';

export const switchTrackClass = [
  'flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-border-strong p-0.5',
  'transition-colors motion-base',
  'group-data-selected:bg-primary',
  'group-data-focus-visible:ring-2 group-data-focus-visible:ring-ring group-data-focus-visible:ring-offset-2 group-data-focus-visible:ring-offset-background',
  'group-data-disabled:opacity-50',
].join(' ');

export const switchThumbClass = 'size-3.5 rounded-full bg-background shadow-sm transition-transform motion-base group-data-selected:translate-x-4';
