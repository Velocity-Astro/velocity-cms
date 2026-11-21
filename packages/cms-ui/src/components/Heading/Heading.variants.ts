import { cva, type VariantProps } from 'class-variance-authority';

export const headingVariants = cva('text-foreground tracking-tight', {
  variants: {
    size: {
      sm: 'text-base font-semibold',
      md: 'text-lg font-semibold',
      lg: 'text-xl font-semibold',
      xl: 'text-2xl font-semibold',
      // A screen's title: the display face, as on the site itself.
      display: 'font-display text-3xl font-bold',
    },
    /** One line, cut with an ellipsis: for a title in a bar, where a long name must not push the buttons off. */
    truncate: { true: 'truncate', false: '' },
  },
});

/** The size a heading has when none is given: one step smaller for each level down. */
export const sizeForLevel = { 1: 'display', 2: 'lg', 3: 'md', 4: 'sm' } as const;

export type HeadingVariants = VariantProps<typeof headingVariants>;
