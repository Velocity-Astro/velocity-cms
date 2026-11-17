import type { RouteObject } from 'react-router';
import { ContentListScreen } from '../screens/ContentList/ContentListScreen.js';
import { HomeScreen } from '../screens/Home/HomeScreen.js';
import { SignInScreen } from '../screens/SignIn/SignInScreen.js';
import { AdminLayout } from './AdminLayout.js';
import { NavigationBridge } from './NavigationBridge.js';

/** Every screen and its address. A new screen is added here and in `paths.ts`. */
export function createRoutes(siteName: string): RouteObject[] {
  return [
    {
      element: <NavigationBridge />,
      children: [
        { path: 'sign-in', element: <SignInScreen siteName={siteName} /> },
        {
          element: <AdminLayout siteName={siteName} />,
          children: [
            { index: true, element: <HomeScreen /> },
            { path: 'content/:typeKey', element: <ContentListScreen /> },
          ],
        },
      ],
    },
  ];
}
