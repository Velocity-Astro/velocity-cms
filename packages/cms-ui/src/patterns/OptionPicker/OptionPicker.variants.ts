import { cva } from 'class-variance-authority';

// The description sits on the highlighted option's background too, where the muted colour is too faint in dark.
export const optionPickerListClass = 'flex flex-col gap-4 pb-4 outline-none';
export const optionPickerEmptyClass = 'py-6 text-center text-sm text-foreground-muted';
export const optionPickerGroupVariants = cva('', {
  variants: {
    layout: {
      rows: 'flex flex-col gap-1',
      // The group's name takes a row of its own above its cards.
      cards: 'grid grid-cols-2 gap-2 sm:grid-cols-3',
    },
  },
});
export const optionPickerGroupLabelClass = 'col-span-full px-2 pb-1 text-xs font-medium tracking-wide text-foreground-muted uppercase';
export const optionPickerOptionVariants = cva(
  [
    'flex cursor-default rounded-md p-2 outline-none',
    'transition-colors motion-fast data-hovered:bg-secondary data-focused:bg-secondary',
    'data-focus-visible:ring-2 data-focus-visible:ring-input-focus',
  ],
  {
    variants: {
      layout: {
        rows: 'items-center gap-3',
        cards: 'flex-col gap-2',
      },
    },
  },
);
export const optionPickerIconVariants = cva('grid shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground', {
  variants: {
    layout: {
      rows: 'size-9',
      cards: 'aspect-video w-full border border-border',
    },
  },
});
export const optionPickerTextClass = 'flex min-w-0 flex-col';
export const optionPickerLabelClass = 'text-sm font-medium text-foreground';
export const optionPickerDescriptionClass = 'text-sm text-foreground-secondary';

/** The size of an option's icon, in pixels. */
export const optionPickerIconSize = 18;
