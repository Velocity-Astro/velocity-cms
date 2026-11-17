import { render, type RenderResult } from '@testing-library/react';
import { AdminApp } from '../app/AdminApp.js';
import { MemoryAdminClient, type MemoryAdminClientOptions } from './memory-client.js';

/** Renders the whole editor at an address, against an in-memory server. */
export function renderApp(path: string, options: MemoryAdminClientOptions = {}): RenderResult & { client: MemoryAdminClient } {
  const client = new MemoryAdminClient(options);
  return { client, ...render(<AdminApp client={client} siteName="Lakeshore Realty" initialPath={path} />) };
}
