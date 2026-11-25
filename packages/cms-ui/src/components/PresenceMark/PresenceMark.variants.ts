import { cva } from 'class-variance-authority';

/**
 * Taken, a ring a little away from the field in the colour that says "for your information", the gap in the
 * colour of the card it sits on. Otherwise nothing at all, as with `Spotlight`.
 */
export const presenceMarkVariants = cva('min-w-0 rounded-md transition-shadow motion-base', {
  variants: {
    taken: {
      true: 'ring-2 ring-info ring-offset-4 ring-offset-card',
      false: 'ring-0 ring-transparent',
    },
  },
  defaultVariants: { taken: false },
});

/** Who is there, under what they are at, in the same colours as a `Tag` that informs. */
export const presenceMarkLabelVariants = cva('mt-2 inline-flex h-6 items-center rounded-md bg-info-light px-2 text-xs font-medium text-info-foreground');
