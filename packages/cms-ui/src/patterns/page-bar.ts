import { createContext, useContext } from 'react';

/**
 * Where a screen's header goes: the bar across the top of `AppShell`. The shell gives the element
 * once it is drawn (`null` until then); outside a shell there is none (`undefined`), and a header
 * is drawn where it stands, as in a story or a test of one part.
 */
export const PageBarContext = createContext<HTMLElement | null | undefined>(undefined);

/** The bar a screen's header is drawn in, `null` while the shell is still drawing it, or `undefined` outside a shell. */
export function usePageBar(): HTMLElement | null | undefined {
  return useContext(PageBarContext);
}
