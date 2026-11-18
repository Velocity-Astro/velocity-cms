import { cva, type VariantProps } from 'class-variance-authority';

export const skeletonVariants = cva('motion-skeleton block shrink-0 bg-background-tertiary', {
  variants: {
    shape: {
      /** A line of words. */
      text: 'h-4 rounded-sm',
      /** A heading. */
      title: 'h-8 rounded-md',
      /** A control: a field, a button. */
      control: 'h-10 rounded-md',
      /** A picture, a card, an editor. */
      block: 'h-32 rounded-lg',
      /** A thumbnail or an avatar. */
      square: 'size-10 rounded-md',
    },
    width: {
      full: 'w-full',
      '3/4': 'w-3/4',
      '1/2': 'w-1/2',
      '1/3': 'w-1/3',
      '1/4': 'w-1/4',
      sm: 'w-24',
      xs: 'w-16',
    },
  },
  compoundVariants: [{ shape: 'square', className: 'w-10' }],
  defaultVariants: { shape: 'text', width: 'full' },
});

export const skeletonGroupClass = 'contents';
export const skeletonLabelClass = 'sr-only';

export type SkeletonVariants = VariantProps<typeof skeletonVariants>;
