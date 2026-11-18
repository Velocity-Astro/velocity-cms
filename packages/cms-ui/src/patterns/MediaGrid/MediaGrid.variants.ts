/** Pictures in rows: two across on a narrow screen, up to five on a wide one. */
export const mediaGridClass = 'grid grid-cols-2 gap-4 outline-none sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
export const mediaGridItemClass = [
  'motion-press flex cursor-default flex-col gap-2 rounded-lg border border-border bg-card p-2 outline-none',
  'data-hovered:border-border-strong data-hovered:shadow-sm',
  'data-focus-visible:ring-2 data-focus-visible:ring-input-focus',
].join(' ');
export const mediaGridImageClass = 'aspect-video w-full rounded-md bg-background-secondary object-cover';
export const mediaGridTextClass = 'flex min-w-0 flex-col px-1 pb-1';
export const mediaGridNameClass = 'truncate text-sm font-medium text-foreground';
export const mediaGridNoteClass = 'truncate text-sm text-foreground-muted';
export const mediaGridEmptyClass = 'col-span-full py-10 text-center text-sm text-foreground-muted';
