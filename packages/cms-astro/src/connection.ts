import { lookup } from 'node:dns/promises';
import { createCms, type Actor, type Cms, type NameLookup, type SearchIndex } from '@velocity/cms-core';
import { AuthTeam } from '@velocity/cms-auth/team';
import { openDatabase, SqliteEntryRepository, SqliteFormRepository, SqliteSubmissionRepository, SqliteContactRepository, SqliteDealRepository, SqlitePipelineStore, SqliteCustomFieldsStore, SqliteMediaRepository, SqlitePluginStore, SqliteSchemaRepository, SqliteSearchIndex, type Db } from '@velocity/cms-db';
import { mediaStoreFromEnv } from './media-store.js';
import { siteSecret } from './secret.js';
import { allPlugins } from './site-plugins.js';

export interface ConnectionOptions {
  /**
   * Where the CMS database is. Defaults to the `VELOCITY_CMS_DATABASE_URL` environment variable,
   * then to `file:./cms/data.db`.
   */
  readonly url?: string;
  /** The access token of a hosted database. Defaults to `VELOCITY_CMS_DATABASE_TOKEN`. */
  readonly authToken?: string;
}

/** The site reads content as itself, with read access only. */
export const SITE: Actor = { kind: 'cli', id: 'astro-site', role: 'author' };

export const resolveUrl = (options: ConnectionOptions): string =>
  options.url ?? process.env.VELOCITY_CMS_DATABASE_URL ?? 'file:./cms/data.db';

export interface Connection {
  readonly cms: Cms;
  readonly search: SearchIndex;
  /** The database itself, for the packages that keep their own tables in it, such as sign-in. */
  readonly db: Db;
  close(): void;
}

/** Every address a host's name leads to, so a plugin can refuse a name that leads to a private machine. */
const lookUp: NameLookup = async (host) => (await lookup(host, { all: true })).map((found) => found.address);

export async function connect(options: ConnectionOptions): Promise<Connection> {
  const authToken = options.authToken ?? (process.env.VELOCITY_CMS_DATABASE_TOKEN || undefined);
  const url = resolveUrl(options);
  const database = await openDatabase({ url, ...(authToken !== undefined && { authToken }) });
  const store = mediaStoreFromEnv(url);
  const secret = siteSecret();
  const cms = createCms({
    entries: new SqliteEntryRepository(database.db),
    types: new SqliteSchemaRepository(database.db),
    forms: new SqliteFormRepository(database.db),
    submissions: new SqliteSubmissionRepository(database.db),
    contacts: new SqliteContactRepository(database.db),
    pipeline: new SqlitePipelineStore(database.db),
    customFields: new SqliteCustomFieldsStore(database.db),
    deals: new SqliteDealRepository(database.db),
    team: new AuthTeam(database.db),
    // A secret too short to sign with is the editor's to report, not a reason to read no content.
    ...(secret !== undefined && secret.length >= 32 && { previews: { secret } }),
    ...(store && { media: { storage: { files: new SqliteMediaRepository(database.db), store } } }),
    pluginStore: new SqlitePluginStore(database.db),
    lookup: lookUp,
    onPluginFault: (plugin, error) => console.error(`[velocity-cms] The plugin "${plugin}" failed.`, error),
  });
  return { cms, search: new SqliteSearchIndex(database.db), db: database.db, close: () => database.close() };
}

const shared = new Map<string, Promise<Connection>>();

/** One connection per database for the life of the server, opened on first use. */
export function sharedConnection(options: ConnectionOptions): Promise<Connection> {
  const url = resolveUrl(options);
  let connection = shared.get(url);
  if (!connection) {
    // The site's plugins, and the ones that come with the CMS, start with its one connection, so a field type they add is known
    // before the first page or the editor reads content.
    connection = connect(options).then(async (opened) => {
      await opened.cms.plugins.load(allPlugins());
      return opened;
    });
    shared.set(url, connection);
    // A failed connection must not be remembered, or every later request would fail too.
    connection.catch(() => shared.delete(url));
  }
  return connection;
}
