import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router';
import type { AdminClient } from '../client/admin-client.js';
import { ClientProvider } from '../client/client-context.js';
import { createQueryCache } from '../client/queries.js';
import { createFieldControls, FieldControlsProvider, type FieldControls } from '../fields/index.js';
import type { Messages } from '../messages/en.js';
import { MessagesProvider } from '../messages/messages-context.js';
import { PluginExtensions, PluginExtensionsProvider, sitePluginEditors, type PluginEditorLoader } from '../plugins/plugin-editor.js';
import { bootDrawn } from '../lib/boot.js';
import { createRoutes } from './routes.js';

export interface AdminAppProps {
  /** The connection to the server. */
  readonly client: AdminClient;
  /** The site's name, shown in the sidebar and on the sign-in screen. */
  readonly siteName: string;
  /** Where the editor is mounted on the site. Defaults to `/admin`. */
  readonly basePath?: string;
  /** The editor's words in another language. Defaults to English. */
  readonly messages?: Messages;
  /** A BCP 47 tag such as `es-ES`, for dates and content labels. Defaults to `en`. */
  readonly locale?: string;
  /**
   * The control for each kind of field. Defaults to the built-in ones; to add your own, start
   * from `createFieldControls()` and register it under the name your field type gives as `editor`.
   */
  readonly fieldControls?: FieldControls;
  /**
   * Fetches a plugin's editor file by the plugin's name. Defaults to the file the site serves
   * beside the editor, at `<basePath>/plugins/<name>.js`. For tests and previews.
   */
  readonly pluginEditors?: PluginEditorLoader;
  /**
   * Keeps the address in memory instead of the browser's address bar, starting here. For tests
   * and previews.
   */
  readonly initialPath?: string;
}

/** The whole editor. Render one, give it a client, and it does the rest. */
export function AdminApp({ client, siteName, basePath = '/admin', messages, locale, fieldControls, pluginEditors, initialPath }: AdminAppProps) {
  const [controls] = useState(() => fieldControls ?? createFieldControls());
  const [extensions] = useState(() => new PluginExtensions());
  const [loader] = useState(() => pluginEditors ?? sitePluginEditors(basePath));
  // Created once per app, never shared between two apps on one page.
  const [queries] = useState(createQueryCache);
  const [router] = useState(() => {
    const routes = createRoutes(siteName);
    return initialPath === undefined
      ? createBrowserRouter(routes, { basename: basePath })
      : createMemoryRouter(routes, { initialEntries: [initialPath] });
  });

  // The page's own mark, shown while the script was on its way, fades once the first screen is drawn.
  useEffect(bootDrawn, []);

  return (
    <QueryClientProvider client={queries}>
      <ClientProvider client={client}>
        <MessagesProvider {...(messages && { messages })} {...(locale !== undefined && { locale })}>
          <FieldControlsProvider controls={controls}>
            <PluginExtensionsProvider extensions={extensions} loader={loader}>
              <RouterProvider router={router} />
            </PluginExtensionsProvider>
          </FieldControlsProvider>
        </MessagesProvider>
      </ClientProvider>
    </QueryClientProvider>
  );
}
