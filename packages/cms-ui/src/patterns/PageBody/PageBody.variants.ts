import { cva, type VariantProps } from 'class-variance-authority';

/**
 * A screen's own area: the same gutter on every screen, and its content centred in one of two
 * widths, so no screen runs from edge to edge of a wide window and every screen lines up with the
 * next. The gutter sits outside the width, so the greeting on Home and the lists below it share
 * their edges.
 */
export const pageBodyClass = 'w-full px-4 py-6 md:px-12 md:py-10';

export const pageBodyInnerVariants = cva('mx-auto w-full min-w-0', {
  variants: {
    /**
     * `wide` for what is looked over: lists, tables, boards, the dashboard, an entry with its side
     * column. `narrow` for what is read and filled in from top to bottom: settings, a profile.
     */
    width: {
      wide: 'max-w-7xl',
      narrow: 'max-w-4xl',
    },
  },
  defaultVariants: { width: 'wide' },
});

export type PageBodyVariants = VariantProps<typeof pageBodyInnerVariants>;
