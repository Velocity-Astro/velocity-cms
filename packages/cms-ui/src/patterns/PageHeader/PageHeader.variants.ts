import { cva } from 'class-variance-authority';

/**
 * On its own, the top of a screen, with the actions under the title when there is no room beside it.
 * In the shell's bar, one line: the title and its sentence on the left, the actions on the right.
 */
export const pageHeaderVariants = cva('flex min-w-0 justify-between', {
  variants: {
    place: {
      page: 'flex-wrap items-start gap-x-6 gap-y-4',
      bar: 'flex-1 items-center gap-4 py-2',
    },
  },
  defaultVariants: { place: 'page' },
});
export const pageHeaderTitleVariants = cva('flex min-w-0 flex-col', {
  variants: { place: { page: 'gap-1', bar: 'gap-0' } },
  defaultVariants: { place: 'page' },
});
export const pageHeaderActionsClass = 'flex max-w-full shrink-0 flex-wrap items-center gap-2';
