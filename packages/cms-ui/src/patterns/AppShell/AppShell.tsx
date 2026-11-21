import { ChevronsUpDown, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button as AriaButton, Link } from 'react-aria-components';
import { Menu, type MenuAction } from '../../components/Menu/index.js';
import {
  appShellAccountAvatarClass,
  appShellAccountClass,
  appShellAccountLabelClass,
  appShellAccountDetailClass,
  appShellAccountIconSize,
  appShellAccountNameClass,
  appShellAccountTextClass,
  appShellBrandClass,
  appShellBrandDetailClass,
  appShellBrandNameClass,
  appShellBrandTextClass,
  appShellClass,
  appShellFooterClass,
  appShellGroupLabelClass,
  appShellMainClass,
  appShellMainId,
  appShellNavClass,
  appShellNavIconSize,
  appShellNavLinkVariants,
  appShellNavListClass,
  appShellSidebarClass,
  appShellSkipClass,
} from './AppShell.variants.js';

export interface AppShellNavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon?: LucideIcon;
  /** The screen being shown is this one, or inside it. */
  readonly isCurrent?: boolean;
}

export interface AppShellNavGroup {
  readonly id: string;
  /** A small heading over the group, such as "Content". The first group usually has none. */
  readonly label?: string;
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

export interface AppShellProps {
  /** The mark at the top of the sidebar: a `Logo`. */
  readonly logo?: ReactNode;
  /** The site's name, at the top of the sidebar. */
  readonly siteName: string;
  /** Under the site's name: its template, or its address. */
  readonly siteDetail?: string;
  /** Names the navigation for screen readers, such as "Main". */
  readonly navLabel: string;
  readonly nav: readonly AppShellNavGroup[];
  /** The words of the link that jumps past the navigation, such as "Skip to content". */
  readonly skipLabel: string;
  /** The signed-in person, at the bottom of the sidebar, with their menu. */
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

/** The frame around every screen: the sidebar with its navigation, and the main area. */
export function AppShell({ logo, siteName, siteDetail, navLabel, nav, skipLabel, account, children }: AppShellProps) {
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
      <aside className={appShellSidebarClass}>
        <div className={appShellBrandClass}>
          {logo}
          <div className={appShellBrandTextClass}>
            <div className={appShellBrandNameClass}>{siteName}</div>
            {siteDetail !== undefined && <div className={appShellBrandDetailClass}>{siteDetail}</div>}
          </div>
        </div>
        <nav aria-label={navLabel} className={appShellNavClass}>
          {nav.map((group) => (
            <div key={group.id} role="group" {...(group.label !== undefined && { 'aria-label': group.label })}>
              {group.label !== undefined && (
                <div aria-hidden className={appShellGroupLabelClass}>
                  {group.label}
                </div>
              )}
              <ul className={appShellNavListClass}>
                {group.items.map(({ id, label, href, icon: Icon, isCurrent = false }) => (
                  <li key={id}>
                    <Link className={appShellNavLinkVariants({ isCurrent })} href={href} {...(isCurrent && { 'aria-current': 'page' })}>
                      {Icon && <Icon aria-hidden size={appShellNavIconSize} />}
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {account !== undefined && (
          <div className={appShellFooterClass}>
            <Menu
              placement="top start"
              actions={account.actions}
              onAction={account.onAction}
              trigger={
                <AriaButton className={appShellAccountClass}>
                  <span className={appShellAccountLabelClass}>{account.label}</span>
                  <span aria-hidden className={appShellAccountAvatarClass}>
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
      </aside>
      <main id={appShellMainId} tabIndex={-1} className={appShellMainClass}>
        {children}
      </main>
    </div>
  );
}
