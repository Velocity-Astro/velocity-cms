import { cva, type VariantProps } from 'class-variance-authority';
import { gap } from '../scales.js';

export const gridVariants = cva('grid', {
  variants: {
    gap,
    columns: {
      1: 'grid-cols-1',
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-4',
    },
  },
  defaultVariants: { gap: 4, columns: 2 },
});

export type GridVariants = VariantProps<typeof gridVariants>;
