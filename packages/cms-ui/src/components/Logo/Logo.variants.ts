import { cva, type VariantProps } from 'class-variance-authority';

export const logoVariants = cva('shrink-0', {
  variants: {
    size: {
      sm: 'h-5 w-5',
      md: 'h-6 w-6',
      lg: 'h-8 w-8',
    },
  },
  defaultVariants: { size: 'md' },
});

/** The top of the mark is the brand colour; the rest follows the text, so it works in the dark. */
export const logoAccentClass = 'fill-brand-fill';
/** The rest of the mark: the text's colour on the page, light on the rail, which is dark in both themes. */
export const logoBodyVariants = cva('', {
  variants: {
    tone: {
      default: 'fill-foreground',
      rail: 'fill-rail-foreground',
    },
  },
  defaultVariants: { tone: 'default' },
});

export type LogoVariants = VariantProps<typeof logoVariants> & VariantProps<typeof logoBodyVariants>;
