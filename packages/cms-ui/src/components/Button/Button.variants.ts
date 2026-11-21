import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 cursor-default items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap',
    'motion-press',
    'outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-offset-2 data-focus-visible:ring-offset-background',
    'data-disabled:opacity-50',
    'data-pending:opacity-70',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground data-hovered:bg-primary-hover data-pressed:bg-primary-hover',
        secondary:
          'border border-border bg-secondary text-secondary-foreground data-hovered:border-border-strong data-hovered:bg-secondary-hover data-pressed:bg-secondary-hover',
        ghost: 'text-foreground-secondary data-hovered:bg-secondary data-hovered:text-foreground data-pressed:bg-secondary-hover',
        danger: 'bg-destructive text-destructive-foreground data-hovered:opacity-90 data-pressed:opacity-90',
        // The brand's colour, a screen's one orange: for the one step a whole view leads to, such as Publish in the visual editor.
        brand: 'bg-brand-fill text-brand-ink data-hovered:bg-brand-fill-hover data-pressed:bg-brand-fill-hover',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-base',
      },
      fullWidth: {
        true: 'w-full',
      },
      /** On a phone, its icon alone in a square: `px-0` with the width of its height. */
      collapses: {
        true: 'max-md:aspect-square max-md:px-0',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md', collapses: false },
  },
);

/** The words of a button that collapses: read out, and shown from `md` up. */
export const buttonLabelVariants = cva('', {
  variants: { collapses: { true: 'max-md:sr-only', false: '' } },
  defaultVariants: { collapses: false },
});

/** The icon's size in pixels for each button size. */
export const iconSize = { sm: 14, md: 16 } as const;

export const spinnerClass = 'animate-spin';

export type ButtonVariants = VariantProps<typeof buttonVariants>;
