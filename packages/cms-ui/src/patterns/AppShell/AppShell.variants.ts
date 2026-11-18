import { cva } from 'class-variance-authority';

/** The page is one quiet surface: the sidebar is part of it, and the screen sits on it in a panel. */
export const appShellClass = 'flex h-dvh overflow-hidden bg-background-secondary text-foreground';

export const appShellSkipClass = [
  'sr-only layer-toast rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground',
  'focus:not-sr-only focus:fixed focus:top-2 focus:left-2',
].join(' ');

export const appShellSidebarClass = 'flex w-60 shrink-0 flex-col px-3 py-5';
export const appShellBrandClass = 'flex items-center gap-2.5 px-2.5 pb-4';
export const appShellBrandTextClass = 'min-w-0';
export const appShellBrandNameClass = 'truncate text-base font-bold text-foreground';
export const appShellBrandDetailClass = 'truncate text-xs text-foreground-muted';
export const appShellNavClass = 'flex-1 overflow-auto';
export const appShellGroupLabelClass = 'px-2.5 pt-4 pb-1.5 text-xs font-semibold tracking-widest text-foreground-muted uppercase';
export const appShellNavListClass = 'flex flex-col gap-0.5';

export const appShellNavLinkVariants = cva(
  [
    'flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-base transition-colors motion-fast',
    'outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring',
  ],
  {
    variants: {
      isCurrent: {
        true: 'bg-card font-semibold text-foreground shadow-sm ring-1 ring-border',
        false: 'font-medium text-foreground-secondary data-hovered:bg-background-tertiary data-hovered:text-foreground',
      },
    },
    defaultVariants: { isCurrent: false },
  },
);

export const appShellFooterClass = 'border-t border-border pt-3';
export const appShellAccountClass = [
  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-foreground-muted transition-colors motion-fast',
  'outline-none data-hovered:bg-background-tertiary data-pressed:bg-background-tertiary data-focus-visible:ring-2 data-focus-visible:ring-ring',
].join(' ');
export const appShellAccountAvatarClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background-tertiary text-xs font-semibold text-foreground';
export const appShellAccountTextClass = 'flex min-w-0 flex-1 flex-col';
export const appShellAccountNameClass = 'truncate text-sm font-semibold text-foreground';
export const appShellAccountDetailClass = 'truncate text-xs text-foreground-muted';
/**
 * `relative`, so that anything placed out of the flow inside the panel (a label only screen readers
 * get) scrolls with it. Without it such an element is placed against the page and makes the page
 * itself scroll far past the frame.
 */
export const appShellMainClass = 'relative my-2 mr-2 min-w-0 flex-1 overflow-auto rounded-2xl border border-border bg-background shadow-sm outline-none';

/** The id of the main area, which the skip link jumps to. */
export const appShellMainId = 'main';
/** The size of a navigation icon, in pixels. */
export const appShellNavIconSize = 16;
/** The size of the arrows on the account button, in pixels. */
export const appShellAccountIconSize = 14;

/** The word that says what the button is, for screen readers only: the name and detail follow it. */
export const appShellAccountLabelClass = 'sr-only';
