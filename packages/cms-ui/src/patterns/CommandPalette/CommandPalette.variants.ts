/** Near the top of the window, where the eye already is, rather than in the middle. */
export const commandPaletteOverlayClass = 'fixed inset-0 layer-overlay flex items-start justify-center bg-scrim px-4 pt-24 motion-scrim';
export const commandPaletteClass =
  'flex max-h-112 w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-background-elevated shadow-xl outline-none motion-pop';
/** The window scrolls as a whole, with the box held at its top, so what scrolls also holds what the keyboard reaches. */
export const commandPaletteContentClass = 'flex min-h-0 flex-col overflow-y-auto outline-none';

export const commandPaletteSearchClass = 'sticky top-0 layer-raised flex shrink-0 items-center gap-3 border-b border-border bg-background-elevated px-4 text-foreground-muted';
export const commandPaletteInputClass = 'h-14 w-full min-w-0 bg-transparent text-lg text-foreground outline-none placeholder:text-foreground-subtle';
export const commandPaletteSearchIconSize = 18;

export const commandPaletteListClass = 'p-2 outline-none';
export const commandPaletteSectionClass = 'pb-1';
export const commandPaletteHeaderClass = 'px-3 pt-2 pb-1 text-xs font-semibold tracking-widest text-foreground-subtle uppercase';
export const commandPaletteItemClass = [
  'flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-base text-foreground outline-none',
  'data-focused:bg-background-tertiary data-hovered:bg-background-secondary',
].join(' ');
export const commandPaletteItemIconClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground-muted';
export const commandPaletteItemLabelClass = 'min-w-0 flex-1 truncate font-medium';
export const commandPaletteItemDetailClass = 'shrink-0 text-sm text-foreground-subtle';
export const commandPaletteItemIconSize = 16;
export const commandPaletteEmptyClass = 'px-3 py-8 text-center text-base text-foreground-muted';
