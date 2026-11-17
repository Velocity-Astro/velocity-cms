export const tabsClass = 'flex flex-col gap-4';
export const tabListClass = 'flex gap-1 border-b border-border';
export const tabClass = [
  '-mb-px cursor-default border-b-2 border-transparent px-3 py-2 text-base font-medium text-foreground-secondary',
  'transition-colors motion-fast',
  'outline-none data-hovered:text-foreground data-selected:border-primary data-selected:text-foreground',
  'data-focus-visible:rounded-sm data-focus-visible:ring-2 data-focus-visible:ring-ring',
  'data-disabled:text-foreground-subtle',
].join(' ');
export const tabPanelClass = 'outline-none data-focus-visible:rounded-sm data-focus-visible:ring-2 data-focus-visible:ring-ring';
