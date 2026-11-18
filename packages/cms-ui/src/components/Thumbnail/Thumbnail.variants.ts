import { cva, type VariantProps } from 'class-variance-authority';

const variants = {
  size: {
    sm: 'h-8 w-8',
    md: 'h-10 w-14',
    lg: 'h-14 w-20',
  },
  shape: {
    rounded: 'rounded-md',
    circle: 'rounded-full',
  },
} as const;
const defaultVariants = { size: 'md', shape: 'rounded' } as const;

export const thumbnailVariants = cva('shrink-0 border border-border bg-background-secondary object-cover', { variants, defaultVariants });
export const thumbnailEmptyVariants = cva('flex shrink-0 items-center justify-center border border-dashed border-border-strong bg-background-secondary', {
  variants,
  defaultVariants,
});
export const thumbnailIconClass = 'size-4 text-foreground-subtle';

export type ThumbnailVariants = VariantProps<typeof thumbnailVariants>;
