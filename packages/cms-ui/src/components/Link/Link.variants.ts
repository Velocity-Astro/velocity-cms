import { cva, type VariantProps } from 'class-variance-authority';

export const linkVariants = cva(
  [
    'rounded-sm underline underline-offset-2 transition-colors motion-fast',
    'outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-offset-2 data-focus-visible:ring-offset-background',
    'data-disabled:no-underline data-disabled:opacity-50',
  ],
  {
    variants: {
      tone: {
        default: 'text-foreground decoration-border-strong data-hovered:decoration-current',
        muted: 'text-foreground-secondary decoration-border data-hovered:text-foreground data-hovered:decoration-current',
      },
    },
    defaultVariants: { tone: 'default' },
  },
);

export type LinkVariants = VariantProps<typeof linkVariants>;
