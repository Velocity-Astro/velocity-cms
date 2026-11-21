import { cva, type VariantProps } from 'class-variance-authority';

/** In a card of its own, or bare where what holds it is the frame already. */
export const pagePreviewVariants = cva('flex h-full min-h-0 flex-col overflow-hidden bg-background-secondary', {
  variants: { isBare: { true: '', false: 'rounded-lg border border-border' } },
  defaultVariants: { isBare: false },
});
export const pagePreviewBarClass = 'flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-3 py-2';
export const pagePreviewNoteClass = 'min-w-0 truncate text-sm text-foreground-muted';
/** A page shown smaller than it is starts at the pane's corner, and what it leaves over is cut off. */
export const pagePreviewStageVariants = cva('flex min-h-0 flex-1', {
  variants: { isFitted: { true: 'justify-start overflow-hidden', false: 'justify-center' } },
  defaultVariants: { isFitted: false },
});

/** The width, in pixels, of the screen each choice stands for. A pane narrower than that shows the page smaller. */
export const pagePreviewWidths = { phone: 384, tablet: 768, full: 1280 } as const;
export const pagePreviewEmptyClass = 'm-auto max-w-sm px-6 text-center text-sm text-foreground-muted';

/** The page at the width of the screen it is tried on. Narrower than the pane, it stands in the middle with an edge each side. */
export const pagePreviewFrameVariants = cva('bg-background', {
  variants: {
    width: {
      phone: 'border-x border-border',
      tablet: 'border-x border-border',
      full: '',
    },
    // Fitted, its size is the screen's own and it is shown smaller from its corner.
    isFitted: { true: 'max-w-none shrink-0 origin-top-left', false: 'h-full w-full transition-all motion-base' },
  },
  compoundVariants: [
    { width: 'phone', isFitted: false, class: 'max-w-sm' },
    { width: 'tablet', isFitted: false, class: 'max-w-3xl' },
  ],
  defaultVariants: { width: 'full', isFitted: false },
});

export type PagePreviewVariants = VariantProps<typeof pagePreviewFrameVariants>;
