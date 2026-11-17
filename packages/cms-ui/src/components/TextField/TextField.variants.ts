import { cva, type VariantProps } from 'class-variance-authority';
import { fieldControlClass } from '../field.js';

export const textFieldVariants = cva('flex flex-col gap-1.5', {
  variants: {
    width: {
      full: 'w-full',
      md: 'w-80',
      sm: 'w-48',
    },
  },
  defaultVariants: { width: 'full' },
});

export const inputClass = `${fieldControlClass} placeholder:text-foreground-subtle`;

export type TextFieldVariants = VariantProps<typeof textFieldVariants>;
