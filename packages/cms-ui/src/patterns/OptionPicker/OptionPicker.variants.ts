// The description sits on the highlighted option's background too, where the muted colour is too faint in dark.
export const optionPickerListClass = 'flex flex-col gap-4 pb-4 outline-none';
export const optionPickerEmptyClass = 'py-6 text-center text-sm text-foreground-muted';
export const optionPickerGroupClass = 'flex flex-col gap-1';
export const optionPickerGroupLabelClass = 'px-2 pb-1 text-xs font-medium tracking-wide text-foreground-muted uppercase';
export const optionPickerOptionClass = [
  'flex cursor-default items-center gap-3 rounded-md px-2 py-2 outline-none',
  'transition-colors motion-fast data-hovered:bg-secondary data-focused:bg-secondary',
  'data-focus-visible:ring-2 data-focus-visible:ring-input-focus',
].join(' ');
export const optionPickerIconClass = 'grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground';
export const optionPickerTextClass = 'flex min-w-0 flex-col';
export const optionPickerLabelClass = 'text-sm font-medium text-foreground';
export const optionPickerDescriptionClass = 'text-sm text-foreground-secondary';

/** The size of an option's icon, in pixels. */
export const optionPickerIconSize = 18;
