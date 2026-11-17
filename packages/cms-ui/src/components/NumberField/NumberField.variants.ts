import { cva, type VariantProps } from 'class-variance-authority';
import { fieldControlClass } from '../field.js';

export const numberFieldVariants = cva('flex flex-col gap-1.5', {
  variants: {
    width: {
      full: 'w-full',
      md: 'w-80',
      sm: 'w-48',
    },
  },
  defaultVariants: { width: 'sm' },
});

export const numberInputClass = `${fieldControlClass} tabular-nums placeholder:text-foreground-subtle`;

export type NumberFieldVariants = VariantProps<typeof numberFieldVariants>;
