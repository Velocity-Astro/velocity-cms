import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import {
  appShellBrandClass,
  appShellClass,
  appShellFooterClass,
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

export interface AppShellProps {
  /** The site's name or logo, at the top of the sidebar. */
  readonly brand: ReactNode;
  /** Names the navigation for screen readers, such as "Main". */
  readonly navLabel: string;
  readonly nav: readonly AppShellNavItem[];
  /** The words of the link that jumps past the navigation, such as "Skip to content". */
  readonly skipLabel: string;
  /** The bottom of the sidebar: the signed-in person and their menu. */
  readonly footer?: ReactNode;
  /** The screen. */
  readonly children: ReactNode;
}

/** The frame around every screen: the sidebar with its navigation, and the main area. */
export function AppShell({ brand, navLabel, nav, skipLabel, footer, children }: AppShellProps) {
  return (
    <div className={appShellClass}>
      <a className={appShellSkipClass} href={`#${appShellMainId}`}>
        {skipLabel}
      </a>
      <aside className={appShellSidebarClass}>
        <div className={appShellBrandClass}>{brand}</div>
        <nav aria-label={navLabel} className={appShellNavClass}>
          <ul className={appShellNavListClass}>
            {nav.map(({ id, label, href, icon: Icon, isCurrent = false }) => (
              <li key={id}>
                <Link className={appShellNavLinkVariants({ isCurrent })} href={href} {...(isCurrent && { 'aria-current': 'page' })}>
                  {Icon && <Icon aria-hidden size={appShellNavIconSize} />}
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {footer !== undefined && <div className={appShellFooterClass}>{footer}</div>}
      </aside>
      <main id={appShellMainId} tabIndex={-1} className={appShellMainClass}>
        {children}
      </main>
    </div>
  );
}
