import { cva, type VariantProps } from 'class-variance-authority';

export const spinnerVariants = cva('inline-flex items-center gap-2 text-foreground-secondary', {
  variants: {
    size: {
      sm: 'text-sm',
      md: 'text-base',
    },
  },
  defaultVariants: { size: 'md' },
});

export const spinnerIconClass = 'animate-spin';
export const spinnerHiddenLabelClass = 'sr-only';

/** The icon's size in pixels for each size. */
export const spinnerIconSize = { sm: 16, md: 20 } as const;

export type SpinnerVariants = VariantProps<typeof spinnerVariants>;
