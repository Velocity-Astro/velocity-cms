import { cva, type VariantProps } from 'class-variance-authority';

/** Beside the form, the workbench is part of the screen. Whole, it covers the window, over the frame of the editor. */
export const workbenchVariants = cva('', {
  variants: {
    view: {
      beside: 'w-full',
      whole: 'fixed inset-0 layer-overlay flex flex-col bg-background-secondary',
    },
  },
  defaultVariants: { view: 'beside' },
});

/** One column on a narrow screen; from `xl` up, the form in a column of its own width and the pane taking the rest. */
export const workbenchBodyVariants = cva('flex', {
  variants: {
    view: {
      beside: 'w-full flex-col gap-6 xl:flex-row xl:items-start',
      whole: 'min-h-0 flex-1',
    },
  },
  defaultVariants: { view: 'beside' },
});

/** Whole, the form is a panel at the side that scrolls by itself, and slides away to leave the pane the window. On a phone it is as wide as the window, so away it is simply gone. */
export const workbenchFormVariants = cva('flex min-w-0 flex-col gap-6', {
  variants: {
    view: {
      beside: 'xl:w-lg xl:shrink-0',
      whole: 'w-lg max-w-full shrink-0 overflow-auto border-r border-border bg-background p-4 transition-all motion-slide',
    },
    isAway: { true: '', false: '' },
  },
  compoundVariants: [{ view: 'whole', isAway: true, class: 'invisible max-md:hidden md:-ml-128' }],
  defaultVariants: { view: 'beside', isAway: false },
});

/** Beside the form, the pane stays in view while the form scrolls under the bar at the top. */
export const workbenchPaneVariants = cva('min-w-0', {
  variants: {
    view: {
      beside: 'pane-tall xl:sticky xl:top-24 xl:flex-1',
      whole: 'min-h-0 flex-1',
    },
  },
  defaultVariants: { view: 'beside' },
});

export type WorkbenchVariants = VariantProps<typeof workbenchVariants>;
