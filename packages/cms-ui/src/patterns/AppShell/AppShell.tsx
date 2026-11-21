import { ChevronsUpDown, Menu as MenuIcon, Search, type LucideIcon } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger, Link, Modal, ModalOverlay } from 'react-aria-components';
import { Logo } from '../../components/Logo/index.js';
import { Menu, type MenuAction } from '../../components/Menu/index.js';
import { Tooltip } from '../../components/Tooltip/index.js';
import { PageBarBackContext, PageBarContext } from '../page-bar.js';
import {
  appShellAccountDetailClass,
  appShellAccountIconSize,
  appShellAccountNameClass,
  appShellAccountTextClass,
  appShellBarClass,
  appShellBarSlotClass,
  appShellSiteClass,
  appShellSiteDetailClass,
  appShellSiteNameClass,
  appShellClass,
  appShellColumnClass,
  appShellDrawerAccountClass,
  appShellDrawerAvatarClass,
  appShellDrawerChildrenClass,
  appShellDrawerClass,
  appShellDrawerContentClass,
  appShellDrawerFooterClass,
  appShellDrawerNavClass,
  appShellDrawerOverlayClass,
  appShellGroupLabelClass,
  appShellHiddenClass,
  appShellMainClass,
  appShellMainId,
  appShellMenuButtonVariants,
  appShellMenuIconSize,
  appShellNavCountClass,
  appShellNavIconSize,
  appShellNavLabelClass,
  appShellNavLinkVariants,
  appShellNavListClass,
  appShellRailAccountClass,
  appShellRailAvatarClass,
  appShellRailBadgeClass,
  appShellRailClass,
  appShellRailGroupVariants,
  appShellRailIconSize,
  appShellRailLabelClass,
  appShellRailLinkVariants,
  appShellRailListClass,
  appShellRailLogoClass,
  appShellRailNavClass,
  appShellSearchVariants,
  appShellSearchIconSize,
  appShellSearchLabelVariants,
  appShellSearchShortcutVariants,
  appShellSectionClass,
  appShellSkipClass,
} from './AppShell.variants.js';

export interface AppShellNavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon?: LucideIcon;
  /** The screen being shown is this one, or inside it. */
  readonly isCurrent?: boolean;
  /** A short number beside it: how many it holds, or how many are new. */
  readonly count?: string;
  /**
   * The places inside a section, such as each kind of content under "Content". While the section is
   * the current one they are listed in a column beside the rail, under the section's name.
   */
  readonly children?: readonly AppShellNavGroup[];
}

export interface AppShellNavGroup {
  readonly id: string;
  /** A small heading over the group, such as "Content". The first group usually has none. */
  readonly label?: string;
  /** `end` puts the group at the bottom of the rail: the sections a person visits least. */
  readonly place?: 'start' | 'end';
  readonly items: readonly AppShellNavItem[];
}

export interface AppShellAccount {
  /** The signed-in person's name. */
  readonly name: string;
  /** Under the name: their role, or their email. */
  readonly detail?: string;
  /** What the menu is for, for screen readers, such as "Account". Read before the name and detail. */
  readonly label: string;
  readonly actions: readonly MenuAction[];
  readonly onAction: (id: string) => void;
}

export interface AppShellSearch {
  /** What the button says and is called: "Search, jump to or create…". */
  readonly label: string;
  /** The keys that open it too, as they are shown: "⌘K". */
  readonly shortcut?: string;
  readonly onPress: () => void;
}

export interface AppShellProps {
  /** What the mark at the top of the rail stands for, such as "Velocity", for screen readers. */
  readonly logoLabel: string;
  /** The site's name, at the top of a section's column and of the panel of a narrow window. */
  readonly siteName: string;
  /** Under the site's name: its address, or its template. */
  readonly siteDetail?: string;
  /** Names the navigation for screen readers, such as "Main". */
  readonly navLabel: string;
  /** The sections of the rail, in groups. A section may hold places of its own (`children`). */
  readonly nav: readonly AppShellNavGroup[];
  /** The name of the button that opens the navigation on a narrow window, such as "Open the menu". */
  readonly menuLabel: string;
  /** The words of the link that jumps past the navigation, such as "Skip to content". */
  readonly skipLabel: string;
  /** The button at the end of the bar that opens the search. */
  readonly search?: AppShellSearch;
  /** The signed-in person, at the bottom of the rail, with their menu. */
  readonly account?: AppShellAccount;
  /** The screen. */
  readonly children: ReactNode;
}

/** The first letters of up to two names: "Maya Ellison" is "ME". */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

/** One place in a list with its words showing: the column beside the rail, and the panel of a narrow window. */
function PlaceLink({ item, onPress }: { readonly item: AppShellNavItem; readonly onPress: (() => void) | undefined }) {
  const { label, href, icon: Icon, isCurrent = false, count } = item;
  return (
    <Link className={appShellNavLinkVariants({ isCurrent })} href={href} {...(isCurrent && { 'aria-current': 'page' })} {...(onPress && { onPress })}>
      {Icon && <Icon aria-hidden size={appShellNavIconSize} />}
      <span className={appShellNavLabelClass}>{label}</span>
      {count !== undefined && <span className={appShellNavCountClass}>{count}</span>}
    </Link>
  );
}

/** Groups of places, each under its small heading. */
function PlaceGroups({ groups, onPress }: { readonly groups: readonly AppShellNavGroup[]; readonly onPress?: () => void }) {
  return groups.map((group) => (
    <div key={group.id} role="group" {...(group.label !== undefined && { 'aria-label': group.label })}>
      {group.label !== undefined && (
        <div aria-hidden className={appShellGroupLabelClass}>
          {group.label}
        </div>
      )}
      <ul className={appShellNavListClass}>
        {group.items.map((item) => (
          <li key={item.id}>
            <PlaceLink item={item} onPress={onPress} />
          </li>
        ))}
      </ul>
    </div>
  ));
}

/**
 * The frame around every screen: the rail of sections, the places of the current section beside it,
 * the bar across the top, which holds the screen's own header (its `PageHeader` or `SaveBar`) and the
 * search, and the main area, which holds only the screen's content.
 */
export function AppShell({ logoLabel, siteName, siteDetail, navLabel, nav, menuLabel, skipLabel, search, account, children }: AppShellProps) {
  // Where the screen's header is drawn: the screen's own parts are handed it once the bar is there.
  const [bar, setBar] = useState<HTMLElement | null>(null);
  // How many parts of the screen say its bar leads back (one, or none): counted, so one leaving never undoes another.
  const [leadingBack, setLeadingBack] = useState(0);
  const leadsBack = useCallback((yes: boolean) => setLeadingBack((count) => Math.max(0, count + (yes ? 1 : -1))), []);
  const isScreenLeadingBack = leadingBack > 0;
  const site = (
    <div className={appShellSiteClass}>
      <span className={appShellSiteNameClass}>{siteName}</span>
      {siteDetail !== undefined && <span className={appShellSiteDetailClass}>{siteDetail}</span>}
    </div>
  );
  const current = nav.flatMap((group) => group.items).find((item) => item.isCurrent === true && (item.children?.length ?? 0) > 0);

  const accountWords = account !== undefined && (
    <>
      <span className={appShellHiddenClass}>{account.label}</span>
      <span aria-hidden className={appShellRailAvatarClass}>
        {initials(account.name)}
      </span>
    </>
  );

  return (
    <div className={appShellClass}>
      <a
        className={appShellSkipClass}
        href={`#${appShellMainId}`}
        // The link is followed here, not by the browser: a page with a base address would be sent
        // to that address, off the screen the person is on.
        onClick={(event) => {
          event.preventDefault();
          document.getElementById(appShellMainId)?.focus();
        }}
      >
        {skipLabel}
      </a>

      <aside className={appShellRailClass}>
        <div className={appShellRailLogoClass}>
          <Logo label={logoLabel} tone="rail" />
        </div>
        <nav aria-label={navLabel} className={appShellRailNavClass}>
          {nav.map((group) => (
            <div key={group.id} role="group" className={appShellRailGroupVariants({ place: group.place })} {...(group.label !== undefined && { 'aria-label': group.label })}>
              <ul className={appShellRailListClass}>
                {group.items.map(({ id, label, href, icon: Icon, isCurrent = false, count }) => (
                  <li key={id}>
                    <Tooltip content={label} placement="right">
                      <Link className={appShellRailLinkVariants({ isCurrent })} href={href} {...(isCurrent && { 'aria-current': 'page' })}>
                        {Icon && <Icon aria-hidden size={appShellRailIconSize} />}
                        <span className={appShellRailLabelClass}>{label}</span>
                        {count !== undefined && (
                          <span aria-hidden className={appShellRailBadgeClass}>
                            {count}
                          </span>
                        )}
                      </Link>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {account !== undefined && (
          <Menu
            placement="top start"
            actions={account.actions}
            onAction={account.onAction}
            trigger={
              <AriaButton className={appShellRailAccountClass}>
                {accountWords}
                <span className={appShellHiddenClass}>
                  <span>{account.name}</span>
                  {account.detail !== undefined && <span>{account.detail}</span>}
                </span>
              </AriaButton>
            }
          />
        )}
      </aside>

      {current?.children !== undefined && (
        <nav aria-label={current.label} className={appShellSectionClass}>
          {site}
          <PlaceGroups groups={current.children} />
        </nav>
      )}

      <div className={appShellColumnClass}>
        <header className={appShellBarClass}>
          <DialogTrigger>
            <AriaButton aria-label={menuLabel} className={appShellMenuButtonVariants({ isScreenLeadingBack })}>
              <MenuIcon aria-hidden size={appShellMenuIconSize} />
            </AriaButton>
            <ModalOverlay isDismissable className={appShellDrawerOverlayClass}>
              <Modal className={appShellDrawerClass}>
                <AriaDialog aria-label={menuLabel} className={appShellDrawerContentClass}>
                  {({ close }) => (
                    <>
                      {site}
                      <nav aria-label={navLabel} className={appShellDrawerNavClass}>
                        {nav.map((group) => (
                          <div key={group.id} role="group" {...(group.label !== undefined && { 'aria-label': group.label })}>
                            {group.label !== undefined && (
                              <div aria-hidden className={appShellGroupLabelClass}>
                                {group.label}
                              </div>
                            )}
                            <ul className={appShellNavListClass}>
                              {group.items.map((item) => (
                                <li key={item.id}>
                                  <PlaceLink item={item} onPress={close} />
                                  {item.children !== undefined && item.children.length > 0 && (
                                    <div className={appShellDrawerChildrenClass}>
                                      <PlaceGroups groups={item.children} onPress={close} />
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </nav>
                      {account !== undefined && (
                        <div className={appShellDrawerFooterClass}>
                          <Menu
                            placement="top start"
                            actions={account.actions}
                            onAction={account.onAction}
                            trigger={
                              <AriaButton className={appShellDrawerAccountClass}>
                                <span className={appShellHiddenClass}>{account.label}</span>
                                <span aria-hidden className={appShellDrawerAvatarClass}>
                                  {initials(account.name)}
                                </span>
                                <span className={appShellAccountTextClass}>
                                  <span className={appShellAccountNameClass}>{account.name}</span>
                                  {account.detail !== undefined && <span className={appShellAccountDetailClass}>{account.detail}</span>}
                                </span>
                                <ChevronsUpDown aria-hidden size={appShellAccountIconSize} />
                              </AriaButton>
                            }
                          />
                        </div>
                      )}
                    </>
                  )}
                </AriaDialog>
              </Modal>
            </ModalOverlay>
          </DialogTrigger>
          <div ref={setBar} className={appShellBarSlotClass} />
          {search !== undefined && (
            <AriaButton className={appShellSearchVariants({ isScreenLeadingBack })} onPress={search.onPress}>
              <Search aria-hidden size={appShellSearchIconSize} />
              <span className={appShellSearchLabelVariants({ isScreenLeadingBack })}>
                {search.label}
              </span>
              {search.shortcut !== undefined && (
                <kbd aria-hidden className={appShellSearchShortcutVariants({ isScreenLeadingBack })}>
                  {search.shortcut}
                </kbd>
              )}
            </AriaButton>
          )}
        </header>
        <main id={appShellMainId} tabIndex={-1} className={appShellMainClass}>
          <PageBarContext value={bar}>
            <PageBarBackContext value={leadsBack}>{children}</PageBarBackContext>
          </PageBarContext>
        </main>
      </div>
    </div>
  );
}
