import { NavigationProvider, Toast } from '@velocity/cms-ui';
import { Outlet, useNavigate } from 'react-router';
import { useMessages } from '../messages/messages-context.js';

/**
 * Around every screen, signed in or not: hands the router to the design system, so its links
 * change the screen without reloading the page, and holds the one place notifications appear.
 */
export function NavigationBridge() {
  const navigate = useNavigate();
  const messages = useMessages();
  return (
    <NavigationProvider navigate={(href) => void navigate(href)}>
      <Outlet />
      <Toast label={messages.app.notifications} closeLabel={messages.app.dismiss} />
    </NavigationProvider>
  );
}
