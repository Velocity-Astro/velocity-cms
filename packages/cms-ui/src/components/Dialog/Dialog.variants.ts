import { cva, type VariantProps } from 'class-variance-authority';

export const dialogOverlayVariants = cva('fixed inset-0 layer-overlay flex bg-scrim', {
  variants: {
    placement: {
      center: 'items-center justify-center p-4',
      side: 'justify-end',
    },
  },
  defaultVariants: { placement: 'center' },
});

export const dialogVariants = cva('w-full overflow-hidden border-border bg-background-elevated shadow-xl outline-none', {
  variants: {
    placement: {
      center: 'max-h-full rounded-lg border',
      side: 'h-full border-l',
    },
    size: {
      sm: 'max-w-sm',
      md: 'max-w-lg',
      lg: 'max-w-2xl',
    },
  },
  defaultVariants: { placement: 'center', size: 'md' },
});

export const dialogContentVariants = cva('flex flex-col outline-none', {
  variants: {
    placement: {
      center: 'max-h-full',
      side: 'h-full',
    },
  },
  defaultVariants: { placement: 'center' },
});

export const dialogHeaderClass = 'flex items-start justify-between gap-4 px-6 pt-5 pb-2';
export const dialogTitleClass = 'pt-1 text-lg font-semibold tracking-tight text-foreground';
export const dialogBodyClass = 'flex-1 overflow-auto px-6 py-2 text-base text-foreground-secondary';
export const dialogFooterClass = 'flex items-center justify-end gap-2 px-6 pt-4 pb-5';

export type DialogVariants = VariantProps<typeof dialogVariants>;
