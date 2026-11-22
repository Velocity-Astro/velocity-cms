import { cva, type VariantProps } from 'class-variance-authority';

export const avatarVariants = cva(
  'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background-tertiary font-semibold text-foreground select-none',
  {
    variants: {
      size: {
        sm: 'h-8 w-8 text-xs',
        md: 'h-12 w-12 text-sm',
        lg: 'h-20 w-20 text-xl',
      },
    },
    defaultVariants: { size: 'md' },
  },
);
export const avatarImageClass = 'h-full w-full object-cover';

export type AvatarVariants = VariantProps<typeof avatarVariants>;
