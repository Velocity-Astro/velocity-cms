import { cva, type VariantProps } from 'class-variance-authority';

export const headingVariants = cva('text-foreground font-semibold tracking-tight', {
  variants: {
    size: {
      sm: 'text-base',
      md: 'text-lg',
      lg: 'text-xl',
      xl: 'text-2xl',
    },
  },
});

/** The size a heading has when none is given: one step smaller for each level down. */
export const sizeForLevel = { 1: 'xl', 2: 'lg', 3: 'md', 4: 'sm' } as const;

export type HeadingVariants = VariantProps<typeof headingVariants>;
