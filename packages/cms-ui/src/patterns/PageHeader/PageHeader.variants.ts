import { cva } from 'class-variance-authority';

/**
 * On its own, the top of a screen, with the actions under the title when there is no room beside it.
 * In the shell's bar, one line: the title and its sentence on the left, the actions on the right.
 */
export const pageHeaderVariants = cva('min-w-0 justify-between', {
  variants: {
    place: {
      page: 'flex flex-wrap items-start gap-x-6 gap-y-4',
      // On a phone its parts are the bar's own: the title beside the menu, the buttons on a row under them.
      bar: 'contents md:flex md:flex-1 md:items-center md:gap-4 md:py-2',
    },
  },
  defaultVariants: { place: 'page' },
});
export const pageHeaderTitleVariants = cva('flex min-w-0 flex-col', {
  variants: { place: { page: 'gap-1', bar: 'order-2 flex-1 gap-0 md:order-none' } },
  defaultVariants: { place: 'page' },
});
export const pageHeaderActionsVariants = cva('flex max-w-full shrink-0 flex-wrap items-center gap-2', {
  variants: { place: { page: '', bar: 'order-4 w-full justify-end md:order-none md:w-auto' } },
  defaultVariants: { place: 'page' },
});
