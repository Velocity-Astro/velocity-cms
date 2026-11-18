import { cva, type VariantProps } from 'class-variance-authority';

export const pagePreviewClass = 'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background-secondary';
export const pagePreviewBarClass = 'flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-3 py-2';
export const pagePreviewNoteClass = 'min-w-0 truncate text-sm text-foreground-muted';
export const pagePreviewStageClass = 'flex min-h-0 flex-1 justify-center';
export const pagePreviewEmptyClass = 'm-auto max-w-sm px-6 text-center text-sm text-foreground-muted';

/** The page at the width of the screen it is tried on. Narrower than the pane, it stands in the middle with an edge each side. */
export const pagePreviewFrameVariants = cva('h-full w-full bg-background transition-all motion-base', {
  variants: {
    width: {
      phone: 'max-w-sm border-x border-border',
      tablet: 'max-w-3xl border-x border-border',
      full: '',
    },
  },
  defaultVariants: { width: 'full' },
});

export type PagePreviewVariants = VariantProps<typeof pagePreviewFrameVariants>;
