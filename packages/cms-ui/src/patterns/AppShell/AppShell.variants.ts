import { cva } from 'class-variance-authority';

/**
 * From `md` up the window has three parts side by side: the rail of sections, dark in both themes;
 * beside it, when the section being shown has places of its own, a column naming them; then the bar
 * across the top and the screen under it. On a narrower window (a phone, a tablet held upright)
 * the rail and the column are behind a button in the bar, so the screen has the width.
 */
export const appShellClass = 'flex h-dvh flex-col overflow-hidden bg-background text-foreground md:flex-row';

export const appShellSkipClass = [
  'sr-only layer-toast rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground',
  'focus:not-sr-only focus:fixed focus:top-2 focus:left-2',
].join(' ');

/* --- The rail --------------------------------------------------------------- */

export const appShellRailClass = 'hidden w-16 shrink-0 flex-col items-center gap-1 bg-rail px-2 py-3 md:flex';
export const appShellRailLogoClass = 'flex h-11 w-11 shrink-0 items-center justify-center pb-2';
export const appShellRailNavClass = 'flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto';
/** A group of sections. Each after the first is set off by a short rule; the group placed at the end sits at the bottom. */
export const appShellRailGroupVariants = cva('flex w-full flex-col items-center gap-1', {
  variants: {
    place: {
      start: 'border-t border-rail-border pt-2 first:border-t-0 first:pt-0',
      end: 'mt-auto pt-2',
    },
  },
  defaultVariants: { place: 'start' },
});
export const appShellRailListClass = 'flex flex-col items-center gap-1';
export const appShellRailLinkVariants = cva(
  [
    'relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors motion-fast',
    'outline-none data-focus-visible:ring-2 data-focus-visible:ring-rail-foreground',
  ],
  {
    variants: {
      isCurrent: {
        true: 'bg-rail-current text-rail-foreground',
        false: 'text-rail-muted data-hovered:bg-rail-hover data-hovered:text-rail-foreground',
      },
    },
    defaultVariants: { isCurrent: false },
  },
);
/** The words of a section's link: read out, and shown in a tooltip, since the rail shows only the icon. */
export const appShellRailLabelClass = 'sr-only';
/** A number on a section, such as what is new in it, at the corner of its icon. */
export const appShellRailBadgeClass =
  'absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rail-foreground px-1 text-xs font-bold text-rail';
export const appShellRailIconSize = 20;

export const appShellRailAccountClass = [
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors motion-fast',
  'outline-none data-hovered:bg-rail-hover data-pressed:bg-rail-hover data-focus-visible:ring-2 data-focus-visible:ring-rail-foreground',
].join(' ');
export const appShellRailAvatarClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rail-current text-xs font-bold text-rail-foreground';

/* --- The column of a section's own places ------------------------------------ */

export const appShellSectionClass = 'hidden w-56 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-card px-3 py-5 md:flex';
/** The site's name and address, at the top of a section's column and of a narrow window's panel. */
export const appShellSiteClass = 'flex min-w-0 flex-col gap-0.5 px-2.5';
export const appShellSiteNameClass = 'truncate text-base font-bold text-foreground';
export const appShellSiteDetailClass = 'truncate text-xs text-foreground-subtle';
export const appShellGroupLabelClass = 'px-2.5 pb-1.5 text-xs font-semibold tracking-widest text-foreground-subtle uppercase';
export const appShellNavListClass = 'flex flex-col gap-0.5';
export const appShellNavLinkVariants = cva(
  [
    'flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-base transition-colors motion-fast',
    'outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring',
  ],
  {
    variants: {
      isCurrent: {
        true: 'bg-background-tertiary font-semibold text-foreground',
        false: 'font-medium text-foreground-muted data-hovered:bg-background-secondary data-hovered:text-foreground',
      },
    },
    defaultVariants: { isCurrent: false },
  },
);
export const appShellNavLabelClass = 'min-w-0 flex-1 truncate';
export const appShellNavCountClass = 'shrink-0 text-xs font-medium text-foreground-muted tabular-nums';
export const appShellNavIconSize = 16;

/* --- The bar across the top -------------------------------------------------- */

export const appShellColumnClass = 'flex min-h-0 min-w-0 flex-1 flex-col';
/** One bar on every screen: the screen's header (title, state and buttons) on the left, the search at the end. */
export const appShellBarClass = 'flex min-h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-3 md:px-6';
/** Where a screen's `PageHeader` or `SaveBar` is drawn. */
export const appShellBarSlotClass = 'flex min-w-0 flex-1 items-center';

/** The button that opens the search, at the end of the bar. Below `xl` it shows only its icon, and its words are read out. */
export const appShellSearchClass = [
  'flex h-10 min-w-0 shrink items-center gap-2.5 rounded-lg border border-border bg-background px-3 text-base text-foreground-subtle transition-colors motion-fast',
  'outline-none data-hovered:border-border-strong data-hovered:text-foreground-muted data-focus-visible:ring-2 data-focus-visible:ring-ring',
  'xl:w-52',
].join(' ');
export const appShellSearchLabelClass = 'sr-only min-w-0 flex-1 truncate text-left xl:not-sr-only xl:overflow-hidden xl:whitespace-nowrap';
export const appShellSearchShortcutClass = 'hidden shrink-0 rounded-sm border border-border px-1.5 font-mono text-xs text-foreground-subtle xl:block';
export const appShellSearchIconSize = 16;

export const appShellMenuButtonClass = [
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-foreground transition-colors motion-fast md:hidden',
  'outline-none data-hovered:bg-background-tertiary data-pressed:bg-background-tertiary data-focus-visible:ring-2 data-focus-visible:ring-ring',
].join(' ');
export const appShellMenuIconSize = 20;

/* --- The panel of a narrow window -------------------------------------------- */

/** The navigation of a narrow window: a panel that slides in from the edge the button is on. */
export const appShellDrawerOverlayClass = 'fixed inset-0 layer-overlay flex bg-scrim motion-scrim';
export const appShellDrawerClass = 'h-full w-72 max-w-full border-r border-border bg-card shadow-xl outline-none motion-sheet-start';
export const appShellDrawerContentClass = 'flex h-full flex-col gap-4 overflow-y-auto px-3 py-5 outline-none';
export const appShellDrawerNavClass = 'flex flex-col gap-4';
/** A section's own places, under its link in the panel. */
export const appShellDrawerChildrenClass = 'flex flex-col gap-0.5 border-l border-border pl-3 ml-4.5';
export const appShellDrawerFooterClass = 'mt-auto border-t border-border pt-3';
export const appShellDrawerAccountClass = [
  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-foreground-muted transition-colors motion-fast',
  'outline-none data-hovered:bg-background-tertiary data-pressed:bg-background-tertiary data-focus-visible:ring-2 data-focus-visible:ring-ring',
].join(' ');
export const appShellDrawerAvatarClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background-tertiary text-xs font-semibold text-foreground';

/* --- The account, as it is read ---------------------------------------------- */

export const appShellAccountTextClass = 'flex min-w-0 flex-1 flex-col';
export const appShellAccountNameClass = 'truncate text-sm font-semibold text-foreground';
export const appShellAccountDetailClass = 'truncate text-xs text-foreground-muted';
/** On the rail only the initials show: the words are for screen readers, and the tooltip. */
export const appShellHiddenClass = 'sr-only';
export const appShellAccountIconSize = 14;

/* --- The screen --------------------------------------------------------------- */

/**
 * `relative`, so that anything placed out of the flow inside the screen (a label only screen readers
 * get) scrolls with it. Without it such an element is placed against the page and makes the page
 * itself scroll far past the frame.
 */
export const appShellMainClass = 'relative min-h-0 min-w-0 flex-1 overflow-auto bg-background outline-none';

/** The id of the main area, which the skip link jumps to. */
export const appShellMainId = 'main';
