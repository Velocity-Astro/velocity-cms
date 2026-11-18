import { cva } from 'class-variance-authority';
import { fieldDescriptionClass, fieldLabelClass } from '../field.js';

export const fieldsetVariants = cva('flex min-w-0 flex-col gap-4', {
  variants: {
    frame: {
      box: 'rounded-md border border-border p-4',
      /** Inside something that already frames it, such as a row that opens. */
      none: '',
    },
  },
  defaultVariants: { frame: 'box' },
});
export const fieldsetLegendVariants = cva('', {
  variants: {
    hidden: {
      false: `${fieldLabelClass} px-1`,
      true: 'sr-only',
    },
  },
  defaultVariants: { hidden: false },
});
export const fieldsetDescriptionClass = fieldDescriptionClass;
