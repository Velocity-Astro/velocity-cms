import { cva, type VariantProps } from 'class-variance-authority';

// At the foot, so a message never covers the buttons at the top of a screen: the SaveBar, a
// page's main action.
export const toastRegionClass = 'fixed bottom-4 right-4 layer-toast w-full max-w-sm outline-none';

// The cards themselves: stacked, and fanned out into a list while pointed at or focused.
export const toastListClass = 'toast-stack';

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
