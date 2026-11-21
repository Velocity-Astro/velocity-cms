import { cva, type VariantProps } from 'class-variance-authority';

/**
 * Beside the form, the workbench is part of the screen. Whole, it covers the window, over the frame of
 * the editor, as a studio of its own: always in the dark theme (`dark` turns every token in it to its
 * dark value), so the page, the one thing in full colour, stands out from it.
 */
export const workbenchVariants = cva('', {
  variants: {
    view: {
      beside: 'w-full',
      whole: 'dark fixed inset-0 layer-overlay flex flex-col bg-rail text-foreground',
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

/**
 * Whole, the form is a panel on the right that scrolls by itself, where what is chosen on the page is edited, and slides away to
 * leave the pane the window. On a phone it is as wide as the window, so away it is simply gone.
 */
export const workbenchFormVariants = cva('flex min-w-0 flex-col gap-6', {
  variants: {
    view: {
      beside: 'xl:w-lg xl:shrink-0',
      whole: 'order-last max-w-full shrink-0 overflow-auto bg-background p-4',
    },
    isAway: { true: '', false: '' },
  },
  compoundVariants: [{ view: 'whole', isAway: true, class: 'hidden' }],
  defaultVariants: { view: 'beside', isAway: false },
});

/** How wide the form's panel is with the whole window, in the steps a person drags it through. */
export const workbenchFormWidthVariants = cva('flex min-w-0 max-w-full flex-col gap-6', {
  variants: {
    width: {
      0: 'md:w-80',
      1: 'md:w-88',
      2: 'md:w-96',
      3: 'md:w-104',
      4: 'md:w-112',
      5: 'md:w-120',
      6: 'md:w-128',
      7: 'md:w-136',
      8: 'md:w-144',
      9: 'md:w-160',
    },
  },
});
export const WORKBENCH_FORM_STEPS = 10;
export const WORKBENCH_FORM_DEFAULT = 6;
/** How wide the outline is, in the same way. */
export const workbenchOutlineWidthVariants = cva('', {
  variants: {
    width: {
      0: 'w-48',
      1: 'w-52',
      2: 'w-56',
      3: 'w-60',
      4: 'w-64',
      5: 'w-72',
      6: 'w-80',
      7: 'w-96',
    },
  },
});
export const WORKBENCH_OUTLINE_STEPS = 8;
export const WORKBENCH_OUTLINE_DEFAULT = 3;
/** How far the pointer moves for one step, in pixels. */
export const workbenchResizeStep = 32;

/** What the form holds, in a column: beside, as wide as the form's column; whole, as wide as the panel was dragged. */
export const workbenchFormInnerClass = 'flex min-w-0 flex-col gap-6';

/** Beside the form, the pane stays in view while the form scrolls under the bar at the top. */
export const workbenchPaneVariants = cva('min-w-0', {
  variants: {
    view: {
      beside: 'pane-tall xl:sticky xl:top-8 xl:flex-1',
      whole: 'min-h-0 flex-1 p-3',
    },
    /** While a panel is dragged wider or narrower, the page takes no pointer, so the drag is not lost over it. */
    isResizing: { true: 'pointer-events-none select-none', false: '' },
  },
  defaultVariants: { view: 'beside', isResizing: false },
});

/** Whole, the way around what is made, on the left: from `lg` up, where there is room for three columns. */
export const workbenchOutlineClass = 'hidden shrink-0 flex-col overflow-auto bg-background p-3 lg:flex';

/**
 * The edge between two columns, dragged to make one wider or narrower, or moved with the arrow keys
 * once it has the focus. It shows as a line, and as the brand's colour while it is held or chosen.
 */
export const workbenchHandleVariants = cva(
  'relative z-10 w-1 shrink-0 cursor-col-resize touch-none bg-border transition-colors motion-fast outline-none hover:bg-border-strong',
  {
    variants: {
      place: { outline: 'hidden lg:block', form: 'order-last max-md:hidden' },
      isActive: { true: 'bg-brand-fill hover:bg-brand-fill', false: '' },
    },
    defaultVariants: { place: 'outline', isActive: false },
  },
);

export type WorkbenchVariants = VariantProps<typeof workbenchVariants>;
