export const searchFieldClass = 'group relative flex w-full items-center';
export const searchFieldIconClass = 'pointer-events-none absolute left-3 text-foreground-muted';

export const searchFieldInputClass = [
  'h-10 w-full rounded-lg border border-border-strong bg-background pr-9 pl-9 text-base text-foreground',
  'placeholder:text-foreground-subtle',
  'outline-none transition-colors motion-fast data-hovered:border-foreground-subtle',
  'data-focused:border-ring data-focused:ring-2 data-focused:ring-ring',
].join(' ');

export const searchFieldClearClass = [
  'absolute right-2 flex h-6 w-6 items-center justify-center rounded-sm text-foreground-muted',
  'outline-none data-hovered:text-foreground data-focus-visible:ring-2 data-focus-visible:ring-ring',
  'group-data-empty:hidden',
].join(' ');

/** The size of the icons, in pixels. */
export const searchFieldIconSize = 16;
