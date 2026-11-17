import { cva, type VariantProps } from 'class-variance-authority';
import { floatingItemClass, floatingPanelClass } from '../field.js';

export const menuPopoverClass = `${floatingPanelClass} min-w-40`;
export const menuClass = 'outline-none';

export const menuItemVariants = cva(floatingItemClass, {
  variants: {
    tone: {
      default: 'text-foreground',
      danger: 'text-destructive',
    },
  },
  defaultVariants: { tone: 'default' },
});

/** The size of an item's icon, in pixels. */
export const menuIconSize = 16;

export type MenuItemVariants = VariantProps<typeof menuItemVariants>;
