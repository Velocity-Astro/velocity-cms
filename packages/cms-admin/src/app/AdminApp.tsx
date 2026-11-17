import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router';
import type { AdminClient } from '../client/admin-client.js';
import { ClientProvider } from '../client/client-context.js';
import type { Messages } from '../messages/en.js';
import { MessagesProvider } from '../messages/messages-context.js';
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
   * Keeps the address in memory instead of the browser's address bar, starting here. For tests
   * and previews.
   */
  readonly initialPath?: string;
}

/** The whole editor. Render one, give it a client, and it does the rest. */
export function AdminApp({ client, siteName, basePath = '/admin', messages, locale, initialPath }: AdminAppProps) {
  // Created once per app, never shared between two apps on one page.
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } }));
  const [router] = useState(() => {
    const routes = createRoutes(siteName);
    return initialPath === undefined
      ? createBrowserRouter(routes, { basename: basePath })
      : createMemoryRouter(routes, { initialEntries: [initialPath] });
  });

  return (
    <QueryClientProvider client={queries}>
      <ClientProvider client={client}>
        <MessagesProvider {...(messages && { messages })} {...(locale !== undefined && { locale })}>
          <RouterProvider router={router} />
        </MessagesProvider>
      </ClientProvider>
    </QueryClientProvider>
  );
}
