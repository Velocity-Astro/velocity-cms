import type { RouteObject } from 'react-router';
import { ContentTypeScreen } from '../screens/ContentType/ContentTypeScreen.js';
import { ContentTypesScreen } from '../screens/ContentTypes/ContentTypesScreen.js';
import { ContentListScreen } from '../screens/ContentList/ContentListScreen.js';
import { EntryEditorScreen } from '../screens/EntryEditor/EntryEditorScreen.js';
import { HomeScreen } from '../screens/Home/HomeScreen.js';
import { MediaScreen } from '../screens/Media/MediaScreen.js';
import { PluginScreenScreen } from '../screens/PluginScreen/PluginScreenScreen.js';
import { PluginsScreen } from '../screens/Plugins/PluginsScreen.js';
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
            { path: 'media', element: <MediaScreen /> },
            { path: 'plugins', element: <PluginsScreen /> },
            { path: 'plugins/:pluginName/:screenId', element: <PluginScreenScreen /> },
            { path: 'types', element: <ContentTypesScreen /> },
            { path: 'types/:typeKey', element: <ContentTypeScreen /> },
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
