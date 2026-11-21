import { cva } from 'class-variance-authority';

/** The page is one quiet surface: the sidebar is part of it, and the screen sits on it in a panel. */
/**
 * From `md` up the navigation is a sidebar beside the screen. On a narrower window (a phone, a
 * tablet held upright) it is behind a button in a bar across the top, so the screen has the width.
 */
export const appShellClass = 'flex h-dvh flex-col overflow-hidden bg-background-secondary text-foreground md:flex-row';

/** The bar across the top of a narrow window: the button that opens the navigation, and the site's name. */
export const appShellTopClass = 'flex shrink-0 items-center gap-2 px-2 py-1.5 md:hidden';
export const appShellTopBrandClass = 'flex min-w-0 items-center gap-2';
export const appShellMenuButtonClass = [
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-foreground transition-colors motion-fast',
  'outline-none data-hovered:bg-background-tertiary data-pressed:bg-background-tertiary data-focus-visible:ring-2 data-focus-visible:ring-ring',
].join(' ');
/** The navigation of a narrow window: a panel that slides in from the edge the button is on. */
export const appShellDrawerOverlayClass = 'fixed inset-0 layer-overlay flex bg-scrim motion-scrim';
export const appShellDrawerClass = 'h-full w-72 max-w-full border-r border-border bg-background-secondary shadow-xl outline-none motion-sheet-start';
export const appShellDrawerContentClass = 'flex h-full flex-col px-3 py-5 outline-none';
/** The size of the icon on the button that opens the navigation, in pixels. */
export const appShellMenuIconSize = 20;

export const appShellSkipClass = [
  'sr-only layer-toast rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground',
  'focus:not-sr-only focus:fixed focus:top-2 focus:left-2',
].join(' ');

export const appShellSidebarClass = 'hidden w-60 shrink-0 flex-col px-3 py-5 md:flex';
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
export const appShellMainClass =
  'relative min-h-0 min-w-0 flex-1 overflow-auto border-t border-border bg-background outline-none md:my-2 md:mr-2 md:rounded-2xl md:border md:shadow-sm';

/** The id of the main area, which the skip link jumps to. */
export const appShellMainId = 'main';
/** The size of a navigation icon, in pixels. */
export const appShellNavIconSize = 16;
/** The size of the arrows on the account button, in pixels. */
export const appShellAccountIconSize = 14;

/** The word that says what the button is, for screen readers only: the name and detail follow it. */
export const appShellAccountLabelClass = 'sr-only';
