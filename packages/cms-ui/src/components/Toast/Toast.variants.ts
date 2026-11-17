import { cva, type VariantProps } from 'class-variance-authority';

export const toastRegionClass = 'fixed right-4 bottom-4 layer-toast flex w-full max-w-sm flex-col-reverse gap-2 outline-none';

export const toastClass = [
  'flex items-start gap-3 rounded-lg border border-border bg-background-elevated p-3 shadow-lg',
  'outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring',
].join(' ');

export const toastIconVariants = cva('mt-0.5 shrink-0', {
  variants: {
    tone: {
      neutral: 'text-foreground-secondary',
      success: 'text-success',
      danger: 'text-destructive',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export const toastContentClass = 'flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5';
export const toastTitleClass = 'text-sm font-medium text-foreground';
export const toastDescriptionClass = 'text-sm text-foreground-secondary';

/** The icon's size in pixels. */
export const toastIconSize = 18;

/**
 * How long a message stays, in milliseconds. Long enough to read twice. A message about
 * something that went wrong stays until it is dismissed.
 */
export const toastDuration = 6000;

export type ToastTone = NonNullable<VariantProps<typeof toastIconVariants>['tone']>;
