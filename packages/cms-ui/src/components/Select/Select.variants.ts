import { cva, type VariantProps } from 'class-variance-authority';
import { fieldControlClass, floatingItemClass, floatingPanelClass } from '../field.js';

export const selectVariants = cva('flex flex-col gap-1.5', {
  variants: {
    width: {
      full: 'w-full',
      md: 'w-80',
      sm: 'w-48',
    },
  },
  defaultVariants: { width: 'full' },
});

export const selectTriggerClass = `${fieldControlClass} flex cursor-default items-center justify-between gap-2 text-left`;
export const selectValueClass = 'min-w-0 flex-1 truncate data-placeholder:text-foreground-subtle';
export const selectChevronClass = 'shrink-0 text-foreground-muted';
export const selectPopoverClass = `${floatingPanelClass} max-h-72 min-w-(--trigger-width)`;
export const selectListClass = 'outline-none';
export const selectOptionClass = `${floatingItemClass} justify-between text-foreground`;
export const selectTickClass = 'shrink-0 text-foreground-secondary';

/** The size of the chevron and the tick, in pixels. */
export const selectIconSize = 16;

export type SelectVariants = VariantProps<typeof selectVariants>;
