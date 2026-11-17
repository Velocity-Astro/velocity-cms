import { cva, type VariantProps } from 'class-variance-authority';
import { fieldBoxClass } from '../field.js';

export const textAreaVariants = cva('flex flex-col gap-1.5', {
  variants: {
    width: {
      full: 'w-full',
      md: 'w-80',
    },
  },
  defaultVariants: { width: 'full' },
});

export const textAreaInputClass = `${fieldBoxClass} min-h-20 resize-y py-2 placeholder:text-foreground-subtle`;

/** How many lines tall the box starts. */
export const textAreaDefaultRows = 4;

export type TextAreaVariants = VariantProps<typeof textAreaVariants>;
