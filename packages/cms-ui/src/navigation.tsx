import type { ReactNode } from 'react';
import { RouterProvider } from 'react-aria-components';

export interface NavigationProviderProps {
  /** Goes to an address inside the app without loading a new page. */
  readonly navigate: (href: string) => void;
  readonly children: ReactNode;
}

/**
 * Connects every `Link`, and the navigation in `AppShell`, to the app's router, so links inside
 * the app change the screen without reloading the page. Put one around the app.
 */
export function NavigationProvider({ navigate, children }: NavigationProviderProps) {
  return <RouterProvider navigate={navigate}>{children}</RouterProvider>;
}
