import type { RouteObject } from 'react-router';
import { ContentListScreen } from '../screens/ContentList/ContentListScreen.js';
import { EntryEditorScreen } from '../screens/EntryEditor/EntryEditorScreen.js';
import { HomeScreen } from '../screens/Home/HomeScreen.js';
import { PeopleScreen } from '../screens/People/PeopleScreen.js';
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
            { index: true, element: <HomeScreen siteName={siteName} /> },
            { path: 'people', element: <PeopleScreen /> },
            { path: 'content/:typeKey', element: <ContentListScreen /> },
            // A new entry has this address too, with `NEW_ENTRY` as its id, so saving it for the
            // first time changes the address without starting the screen again.
            { path: 'content/:typeKey/:entryId', element: <EntryEditorScreen /> },
          ],
        },
      ],
    },
  ];
}
