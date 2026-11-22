/** The whole screen, quiet, with the mark and its words in the middle of a clearing in the grid. */
export const loadingMarkClass = 'flex min-h-dvh w-full flex-col items-center justify-center gap-5 bg-background bg-grid-clearing';
export const loadingMarkSvgClass = 'h-auto w-16 overflow-visible';
/** Before a facet has its colour. */
export const loadingMarkGreyClass = 'fill-border';
/** Each facet arrives from its own side. */
export const loadingMarkPieceClass = { top: 'motion-mark-top', left: 'motion-mark-left', right: 'motion-mark-right' } as const;
/**
 * Its colour, a moment later: the brand's on the top facet, the text's on the two below, as the
 * `Logo` has them, so the mark reads in both themes.
 */
export const loadingMarkColourClass = {
  top: 'fill-brand-fill motion-mark-colour-top',
  left: 'fill-foreground motion-mark-colour-left',
  right: 'fill-foreground motion-mark-colour-right',
} as const;
export const loadingMarkLabelClass = 'text-sm font-medium text-foreground-subtle';
