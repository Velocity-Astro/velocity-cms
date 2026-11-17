import { cva, type VariantProps } from 'class-variance-authority';
import { gap } from '../scales.js';

export const stackVariants = cva('flex flex-col', {
  variants: {
    gap,
    align: {
      stretch: 'items-stretch',
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
    },
    fill: {
      true: 'min-h-full',
    },
  },
  defaultVariants: { gap: 4, align: 'stretch' },
});

export type StackVariants = VariantProps<typeof stackVariants>;
