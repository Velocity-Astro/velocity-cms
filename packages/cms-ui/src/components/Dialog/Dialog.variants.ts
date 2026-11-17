import { cva, type VariantProps } from 'class-variance-authority';

export const dialogOverlayClass = 'fixed inset-0 layer-overlay flex items-center justify-center bg-scrim p-4';

export const dialogVariants = cva('max-h-full w-full overflow-hidden rounded-lg border border-border bg-background-elevated shadow-xl outline-none', {
  variants: {
    size: {
      sm: 'max-w-sm',
      md: 'max-w-lg',
      lg: 'max-w-2xl',
    },
  },
  defaultVariants: { size: 'md' },
});

export const dialogClass = 'flex max-h-full flex-col outline-none';
export const dialogHeaderClass = 'flex items-start justify-between gap-4 px-6 pt-5 pb-2';
export const dialogTitleClass = 'pt-1 text-lg font-semibold tracking-tight text-foreground';
export const dialogBodyClass = 'overflow-auto px-6 py-2 text-base text-foreground-secondary';
export const dialogFooterClass = 'flex items-center justify-end gap-2 px-6 pt-4 pb-5';

export type DialogVariants = VariantProps<typeof dialogVariants>;
