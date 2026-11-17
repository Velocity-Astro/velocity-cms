import { cva, type VariantProps } from 'class-variance-authority';
import { fieldControlClass } from '../field.js';

export const dateFieldVariants = cva('flex flex-col gap-1.5', {
  variants: {
    width: {
      full: 'w-full',
      md: 'w-80',
      sm: 'w-48',
    },
  },
  defaultVariants: { width: 'sm' },
});

export const dateInputClass = `${fieldControlClass} flex items-center tabular-nums data-focus-within:border-input-focus data-focus-within:ring-1 data-focus-within:ring-input-focus`;

export const dateSegmentClass = [
  'rounded-sm px-0.5 outline-none',
  'data-placeholder:text-foreground-subtle',
  'data-focused:bg-primary data-focused:text-primary-foreground',
].join(' ');

export type DateFieldVariants = VariantProps<typeof dateFieldVariants>;
