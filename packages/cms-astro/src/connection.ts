import { createCms, type Actor, type Cms, type SearchIndex } from '@velocity/cms-core';
import { openDatabase, SqliteEntryRepository, SqliteSchemaRepository, SqliteSearchIndex } from '@velocity/cms-db';

export interface ConnectionOptions {
  /**
   * Where the CMS database is. Defaults to the `VELOCITY_CMS_DATABASE_URL` environment variable,
   * then to `file:./cms/data.db`.
   */
  readonly url?: string;
  readonly authToken?: string;
}

/** The site reads content as itself, with read access only. */
export const SITE: Actor = { kind: 'cli', id: 'astro-site', role: 'author' };

export const resolveUrl = (options: ConnectionOptions): string =>
  options.url ?? process.env.VELOCITY_CMS_DATABASE_URL ?? 'file:./cms/data.db';

export interface Connection {
  readonly cms: Cms;
  readonly search: SearchIndex;
  close(): void;
}

export async function connect(options: ConnectionOptions): Promise<Connection> {
  const database = await openDatabase({
    url: resolveUrl(options),
    ...(options.authToken !== undefined && { authToken: options.authToken }),
  });
  const cms = createCms({
    entries: new SqliteEntryRepository(database.db),
    types: new SqliteSchemaRepository(database.db),
  });
  return { cms, search: new SqliteSearchIndex(database.db), close: () => database.close() };
}

const shared = new Map<string, Promise<Connection>>();

/** One connection per database for the life of the server, opened on first use. */
export function sharedConnection(options: ConnectionOptions): Promise<Connection> {
  const url = resolveUrl(options);
  let connection = shared.get(url);
  if (!connection) {
    connection = connect(options);
    shared.set(url, connection);
    // A failed connection must not be remembered, or every later request would fail too.
    connection.catch(() => shared.delete(url));
  }
  return connection;
}
