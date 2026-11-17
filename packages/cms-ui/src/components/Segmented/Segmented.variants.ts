export const segmentedClass = 'inline-flex flex-wrap gap-1';

export const segmentedOptionClass = [
  'inline-flex h-8 cursor-default items-center rounded-md px-3 text-sm font-medium text-foreground-secondary',
  'transition-colors motion-fast',
  'outline-none data-hovered:text-foreground data-selected:bg-background-tertiary data-selected:text-foreground',
  'data-focus-visible:ring-2 data-focus-visible:ring-ring data-disabled:text-foreground-subtle',
].join(' ');
