import { cva } from 'class-variance-authority';

export const spotlightVariants = cva('min-w-0 rounded-md ring-offset-4 ring-offset-background transition-shadow motion-base', {
  variants: {
    lit: {
      true: 'ring-2 ring-ring',
      false: 'ring-0 ring-transparent',
    },
  },
  defaultVariants: { lit: false },
});
