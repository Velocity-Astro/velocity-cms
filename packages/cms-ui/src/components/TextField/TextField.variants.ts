import { cva, type VariantProps } from 'class-variance-authority';

export const textFieldVariants = cva('flex flex-col gap-1.5', {
  variants: {
    width: {
      full: 'w-full',
      md: 'w-80',
      sm: 'w-48',
    },
  },
  defaultVariants: { width: 'full' },
});

export const labelClass = 'text-sm font-medium text-foreground';
export const requiredMarkClass = 'text-destructive';
export const inputClass = [
  'h-10 w-full rounded-md border border-input-border bg-input px-3 text-base text-foreground',
  'placeholder:text-foreground-subtle',
  'transition-colors motion-fast',
  'outline-none data-hovered:border-border-strong data-focused:border-input-focus data-focused:ring-1 data-focused:ring-input-focus',
  'data-invalid:border-destructive data-invalid:data-focused:ring-destructive',
  'data-disabled:bg-background-secondary data-disabled:text-foreground-muted',
].join(' ');
export const descriptionClass = 'text-sm text-foreground-muted';
export const errorClass = 'text-sm text-destructive';

export type TextFieldVariants = VariantProps<typeof textFieldVariants>;
