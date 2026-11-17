import { cva, type VariantProps } from 'class-variance-authority';
import { gap } from '../scales.js';

export const formVariants = cva('flex flex-col', {
  variants: { gap },
  defaultVariants: { gap: 4 },
});

export type FormVariants = VariantProps<typeof formVariants>;
