import { cva, type VariantProps } from 'class-variance-authority';

/** `relative`, so the link at its foot can stretch over the whole card and make all of it one thing to press. */
export const siteWindowClass =
  'group relative w-full min-w-0 max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-xl transition-colors motion-base has-data-hovered:border-border-strong has-data-focus-visible:ring-2 has-data-focus-visible:ring-ring';
export const siteWindowBarClass = 'flex items-center gap-3 border-b border-border bg-background-secondary px-3.5 py-2.5';
export const siteWindowDotsClass = 'flex shrink-0 gap-1.5';
export const siteWindowDotClass = 'h-2.5 w-2.5 rounded-full bg-border-strong';
export const siteWindowAddressClass = 'min-w-0 flex-1 truncate text-center font-mono text-xs text-foreground-subtle';
export const siteWindowSpacerClass = 'w-10 shrink-0';
/**
 * The page is drawn at twice the card's width and shown at half its size, so it looks as it does on
 * a desktop. It cannot be pressed or reached by the keyboard: the card is a way to edit the page, not the page.
 */
export const siteWindowViewVariants = cva('relative overflow-hidden bg-background', {
  variants: { size: { md: 'h-72', sm: 'h-40' } },
  defaultVariants: { size: 'md' },
});
/** `sm` draws the page wider still and shows it at a fifth of its size, for a narrow column. */
export const siteWindowFrameVariants = cva('pointer-events-none absolute top-0 left-0 origin-top-left border-0', {
  variants: { size: { md: 'h-144 w-288 scale-50', sm: 'h-200 w-320 scale-20' } },
  defaultVariants: { size: 'md' },
});
export type SiteWindowVariants = VariantProps<typeof siteWindowViewVariants>;
export const siteWindowFootClass = 'flex items-center gap-3 border-t border-border px-4 py-3 text-sm';
export const siteWindowMetaClass = 'min-w-0 flex-1 truncate text-foreground-muted';
export const siteWindowLinkClass = 'shrink-0 font-semibold text-foreground outline-none after:absolute after:inset-0 group-hover:underline';
