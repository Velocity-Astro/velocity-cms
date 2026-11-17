import { cva, type VariantProps } from 'class-variance-authority';

export const textVariants = cva('', {
  variants: {
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
    },
    tone: {
      default: 'text-foreground',
      secondary: 'text-foreground-secondary',
      muted: 'text-foreground-muted',
      danger: 'text-destructive',
      success: 'text-success-foreground',
    },
    weight: {
      regular: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
    },
    truncate: {
      true: 'truncate',
    },
    mono: {
      true: 'font-mono',
    },
  },
  defaultVariants: { size: 'base', tone: 'default', weight: 'regular' },
});

export type TextVariants = VariantProps<typeof textVariants>;
