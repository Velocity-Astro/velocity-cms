import { NavigationProvider } from '@velocity/cms-ui';
import { Outlet, useNavigate } from 'react-router';

/** Hands the router to the design system, so its links change the screen without reloading the page. */
export function NavigationBridge() {
  const navigate = useNavigate();
  return (
    <NavigationProvider navigate={(href) => void navigate(href)}>
      <Outlet />
    </NavigationProvider>
  );
}
