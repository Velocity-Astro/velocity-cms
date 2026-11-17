import { cva } from 'class-variance-authority';

export const appShellClass = 'flex h-dvh bg-background-secondary text-foreground';

export const appShellSkipClass = [
  'sr-only layer-toast rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground',
  'focus:not-sr-only focus:fixed focus:top-2 focus:left-2',
].join(' ');

export const appShellSidebarClass = 'flex w-60 shrink-0 flex-col gap-4 border-r border-border bg-background px-3 py-4';
export const appShellBrandClass = 'flex h-8 items-center px-2';
export const appShellNavClass = 'flex-1 overflow-auto';
export const appShellNavListClass = 'flex flex-col gap-0.5';

export const appShellNavLinkVariants = cva(
  [
    'flex items-center gap-2 rounded-md px-2 py-1.5 text-base font-medium transition-colors motion-fast',
    'outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring',
  ],
  {
    variants: {
      isCurrent: {
        true: 'bg-secondary text-foreground',
        false: 'text-foreground-secondary data-hovered:bg-secondary data-hovered:text-foreground',
      },
    },
    defaultVariants: { isCurrent: false },
  },
);

export const appShellFooterClass = 'border-t border-border pt-3';
export const appShellMainClass = 'min-w-0 flex-1 overflow-auto bg-background outline-none';

/** The id of the main area, which the skip link jumps to. */
export const appShellMainId = 'main';
/** The size of a navigation icon, in pixels. */
export const appShellNavIconSize = 18;
