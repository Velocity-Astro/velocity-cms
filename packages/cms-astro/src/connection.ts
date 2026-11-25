import { lookup } from 'node:dns/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createCms, type Actor, type Cms, type NameLookup, type SearchIndex } from '@velocity-astro/cms-core';
import { AuthTeam } from '@velocity-astro/cms-auth/team';
import { d1Client, type D1Binding, openDatabase, SqliteEntryRepository, SqliteFormRepository, SqliteSubmissionRepository, SqliteContactRepository, SqliteDealRepository, SqlitePipelineStore, SqlitePresenceStore, SqliteSettingsStore, SqliteCustomFieldsStore, SqliteMediaRepository, SqlitePluginStore, SqliteSchemaRepository, SqliteSearchIndex, type Db } from '@velocity-astro/cms-db';
import { currentSite } from './hosted.js';
import { SharpImageOptimizer } from './image-optimizer.js';
import { bucketFromEnv, folderFromEnv } from './media-store.js';
import { SiteMediaStore } from './site-storage.js';
import { SiteChallenge } from './challenge.js';
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

/** Where the database is. On a server that runs many sites it is the site's own, whatever was asked for. */
export const resolveUrl = (options: ConnectionOptions): string =>
  currentSite()?.database.url ?? options.url ?? process.env.VELOCITY_CMS_DATABASE_URL ?? 'file:./cms/data.db';

export interface Connection {
  readonly cms: Cms;
  readonly search: SearchIndex;
  /** The database itself, for the packages that keep their own tables in it, such as sign-in. */
  readonly db: Db;
  close(): void;
}

/** Every address a host's name leads to, so a plugin can refuse a name that leads to a private machine. */
const lookUp: NameLookup = async (host) => (await lookup(host, { all: true })).map((found) => found.address);

/** One for the whole server: it holds a library and nothing of any site. */
const optimizer = new SharpImageOptimizer();

export async function connect(options: ConnectionOptions): Promise<Connection> {
  const site = currentSite();
  const authToken = site ? site.database.authToken : (options.authToken ?? (process.env.VELOCITY_CMS_DATABASE_TOKEN || undefined));
  const url = resolveUrl(options);
  // A database that is a file is made on first use, and so is the folder it sits in.
  const file = /^file:(?!:memory:)([^?]+)/.exec(url)?.[1];
  if (file !== undefined) mkdirSync(path.dirname(path.resolve(file.replace(/^\/\/(?=\/)/, ''))), { recursive: true });
  // `d1:<binding>` is a Cloudflare D1 database, reached through the Worker's binding of that name.
  const d1 = /^d1:(\w+)$/.exec(url)?.[1];
  let database;
  if (d1 !== undefined) {
    const workers = 'cloudflare:workers';
    const { env } = (await import(/* @vite-ignore */ workers)) as { env: Record<string, D1Binding | undefined> };
    const binding = env[d1];
    if (!binding) throw new Error(`There is no D1 database bound as "${d1}". Add it to d1_databases in the Wrangler config.`);
    database = await openDatabase({ url, client: d1Client(binding) });
  } else {
    // A hosted database on a host with no disk: the migrations come from the bundle.
    const noDisk = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
    database = await openDatabase({ url, ...(authToken !== undefined && { authToken }), ...(noDisk && { bundledMigrations: true }) });
  }
  // A hosted site keeps uploads where its host says, and nowhere a setting of the server names.
  // A site of its own keeps them where the server's settings say, then in the bucket an owner
  // named in the editor, then in a folder beside a database that is a file.
  const store: SiteMediaStore = new SiteMediaStore({
    account: () => cms.settings.bucketAccount(),
    fixed: site ? site.media : bucketFromEnv(),
    hosted: site !== undefined,
    folder: site ? undefined : folderFromEnv(url),
    lookup: lookUp,
  });
  const secret = siteSecret();
  const cms: Cms = createCms({
    entries: new SqliteEntryRepository(database.db),
    types: new SqliteSchemaRepository(database.db),
    forms: new SqliteFormRepository(database.db),
    submissions: new SqliteSubmissionRepository(database.db),
    contacts: new SqliteContactRepository(database.db),
    pipeline: new SqlitePipelineStore(database.db),
    presence: new SqlitePresenceStore(database.db),
    settings: new SqliteSettingsStore(database.db),
    customFields: new SqliteCustomFieldsStore(database.db),
    deals: new SqliteDealRepository(database.db),
    team: new AuthTeam(database.db),
    // A secret too short to sign with is the editor's to report, not a reason to read no content.
    ...(secret !== undefined && secret.length >= 32 && { previews: { secret } }),
    media: {
      storage: { files: new SqliteMediaRepository(database.db), store },
      optimizer,
      // The image is never logged, only that one could not be handled: the upload is kept as it arrived.
      onOptimizerFault: (error) => console.warn('[velocity-cms] An image could not be made lighter, so it is kept as it is.', error),
    },
    pluginStore: new SqlitePluginStore(database.db),
    lookup: lookUp,
    onPluginFault: (plugin, error) => console.error(`[velocity-cms] The plugin "${plugin}" failed.`, error),
  });
  cms.settings.useStorage(store.room());
  cms.settings.useChallenge(new SiteChallenge({ account: () => cms.settings.challengeAccount() }));
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
