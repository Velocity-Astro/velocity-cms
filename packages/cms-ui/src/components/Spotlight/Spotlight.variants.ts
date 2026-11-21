import { cva } from 'class-variance-authority';

/**
 * Lit, a ring a little away from the field, the gap in the colour of the card it sits on. Unlit, nothing at
 * all: an offset drawn round an unlit field would show as a band wherever the card is not the page's colour.
 */
export const spotlightVariants = cva('min-w-0 rounded-md transition-shadow motion-base', {
  variants: {
    lit: {
      true: 'ring-2 ring-ring ring-offset-4 ring-offset-card',
      false: 'ring-0 ring-transparent',
    },
  },
  defaultVariants: { lit: false },
});
