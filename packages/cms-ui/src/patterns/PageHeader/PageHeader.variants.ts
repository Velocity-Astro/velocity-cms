import { cva } from 'class-variance-authority';

/**
 * On its own, the top of a screen, with the actions under the title when there is no room beside it.
 * In the shell's bar, one row on every window: the title and its sentence on the left, the actions on the right.
 */
export const pageHeaderVariants = cva('flex min-w-0 justify-between', {
  variants: {
    place: {
      page: 'flex-wrap items-start gap-x-6 gap-y-4',
      bar: 'flex-1 items-center gap-2 md:gap-4 md:py-2',
    },
  },
  defaultVariants: { place: 'page' },
});
/** In the bar, one row: the title, then its sentence after it, cut to fit. */
export const pageHeaderTitleVariants = cva('flex min-w-0', {
  variants: { place: { page: 'flex-col gap-1', bar: 'flex-1 items-baseline gap-3' } },
  defaultVariants: { place: 'page' },
});
/** In the bar a phone has room for the title alone: the sentence after it comes from `md` up. */
export const pageHeaderDescriptionVariants = cva('min-w-0', {
  variants: { place: { page: '', bar: 'hidden flex-1 md:block' } },
  defaultVariants: { place: 'page' },
});
/** In the bar they never wrap: on a phone they are icons and one menu. */
export const pageHeaderActionsVariants = cva('flex max-w-full shrink-0 items-center', {
  variants: { place: { page: 'flex-wrap gap-2', bar: 'gap-1 md:gap-2' } },
  defaultVariants: { place: 'page' },
});
/** The other buttons, as buttons from `md` up. */
export const pageHeaderSecondaryClass = 'hidden items-center gap-2 md:flex';
/** The same, as one menu on a phone. */
export const pageHeaderMoreClass = 'flex md:hidden';
