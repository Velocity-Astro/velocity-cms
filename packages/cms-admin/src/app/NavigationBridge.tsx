import { NavigationProvider, Toast } from '@velocity-astro/cms-ui';
import { Outlet } from 'react-router';
import { useGo } from './use-go.js';
import { useMessages } from '../messages/messages-context.js';

/**
 * Around every screen, signed in or not: hands the router to the design system, so its links
 * change the screen without reloading the page, and holds the one place notifications appear.
 */
export function NavigationBridge() {
  const go = useGo();
  const messages = useMessages();
  return (
    <NavigationProvider navigate={(href) => go(href)}>
      <Outlet />
      <Toast label={messages.app.notifications} closeLabel={messages.app.dismiss} />
    </NavigationProvider>
  );
}
