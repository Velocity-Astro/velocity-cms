import { createContext, useContext, type ReactNode } from 'react';
import type { AdminClient } from './admin-client.js';

const ClientContext = createContext<AdminClient | null>(null);

export interface ClientProviderProps {
  readonly client: AdminClient;
  readonly children: ReactNode;
}

export function ClientProvider({ client, children }: ClientProviderProps) {
  return <ClientContext value={client}>{children}</ClientContext>;
}

/** The connection to the server. */
export function useClient(): AdminClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useClient() was called outside <AdminApp>. Render the screen inside it.');
  return client;
}
