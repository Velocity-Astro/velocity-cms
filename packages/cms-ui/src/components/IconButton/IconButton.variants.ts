import { cva, type VariantProps } from 'class-variance-authority';

export const iconButtonVariants = cva(
  [
    'inline-flex shrink-0 cursor-default items-center justify-center rounded-md',
    'motion-press',
    'outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-offset-2 data-focus-visible:ring-offset-background',
    'data-disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        ghost: 'text-foreground-secondary data-hovered:bg-secondary data-hovered:text-foreground data-pressed:bg-secondary-hover',
        secondary:
          'border border-border bg-secondary text-secondary-foreground data-hovered:border-border-strong data-hovered:bg-secondary-hover data-pressed:bg-secondary-hover',
      },
      size: {
        sm: 'size-8',
        md: 'size-10',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
);

/** The icon's size in pixels for each button size. */
export const iconButtonIconSize = { sm: 16, md: 18 } as const;

export type IconButtonVariants = VariantProps<typeof iconButtonVariants>;
