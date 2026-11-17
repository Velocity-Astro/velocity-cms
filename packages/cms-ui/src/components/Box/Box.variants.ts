import { cva, type VariantProps } from 'class-variance-authority';
import { padding, paddingX, paddingY } from '../scales.js';

export const boxVariants = cva('', {
  variants: {
    padding,
    paddingX,
    paddingY,
    surface: {
      none: '',
      page: 'bg-background',
      subtle: 'bg-background-secondary',
      card: 'bg-card',
    },
    border: {
      true: 'border border-border',
    },
    radius: {
      none: '',
      sm: 'rounded-sm',
      md: 'rounded-md',
      lg: 'rounded-lg',
    },
    shadow: {
      none: '',
      sm: 'shadow-sm',
      md: 'shadow-md',
    },
    grow: {
      true: 'min-w-0 flex-1',
    },
  },
  defaultVariants: { surface: 'none', radius: 'none', shadow: 'none' },
});

export type BoxVariants = VariantProps<typeof boxVariants>;
