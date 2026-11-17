import { cva, type VariantProps } from 'class-variance-authority';
import { gap } from '../scales.js';

export const inlineVariants = cva('flex flex-row', {
  variants: {
    gap,
    align: {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      baseline: 'items-baseline',
      stretch: 'items-stretch',
    },
    justify: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
    },
    wrap: {
      true: 'flex-wrap',
    },
  },
  defaultVariants: { gap: 2, align: 'center', justify: 'start' },
});

export type InlineVariants = VariantProps<typeof inlineVariants>;
