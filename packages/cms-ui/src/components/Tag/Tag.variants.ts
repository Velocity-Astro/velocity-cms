import { cva, type VariantProps } from 'class-variance-authority';

export const tagVariants = cva('inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-secondary text-secondary-foreground',
      success: 'bg-success-light text-success-foreground',
      warning: 'bg-warning-light text-warning-foreground',
      danger: 'bg-error-light text-error-foreground',
      info: 'bg-info-light text-info-foreground',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type TagVariants = VariantProps<typeof tagVariants>;
