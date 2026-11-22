import { CmsApi } from '@velocity-astro/cms-api';
import { CmsAuth, type InvitationMail, type Mailer, type SignInMail } from '@velocity-astro/cms-auth';
import { pageAddress, type ContentTypeDef, type Entry, type ImageLibrary } from '@velocity-astro/cms-core';
import { AdminFiles, builtEditorDirectory } from './admin-files.js';
import { SITE, type Connection } from './connection.js';
import { invalidateLiveContent } from './live-loader.js';

/** The language of the pages at a type's `urlPattern`, as the API and the previews take it. */
const DEFAULT_LOCALE = 'en';
const PAGE_SIZE = 500;

export interface EditorHostOptions {
  readonly connection: Connection;
  /** The site's secret, `VELOCITY_CMS_SECRET`. It signs sessions and sign-in links. */
  readonly secret: string;
  /** The site's own address, such as `https://example.com`. */
  readonly origin: string;
  readonly siteName: string;
  /** What an owner called the site in the editor's settings, or `null`. Asked each time the editor's page is served. */
  readonly siteNameNow?: () => Promise<string | null>;
  readonly mailer: Mailer;
  /** The site's images, for image fields to choose from. */
  readonly images?: ImageLibrary;
  /** Where the editor is served. Defaults to `/admin`. */
  readonly adminPath?: string;
  /** Where the API is served. Defaults to `/api/cms`; sign-in sits under it at `/auth`. */
  readonly apiPath?: string;
  /** Where the built editor is. Defaults to the one `@velocity-astro/cms-admin` ships. */
  readonly editorDirectory?: string;
  /** Told about every fault in the API, which its responses say nothing about. */
  readonly onFault?: (error: unknown) => void;
}

/**
 * Prints sign-in links to the server's log instead of sending them. This is the mailer a site
 * has until it sets up its own, and it is enough to work locally: copy the link from the log.
 */
export class LogMailer implements Mailer {
  constructor(private readonly log: (line: string) => void = (line) => console.info(line)) {}

  async sendSignInLink(mail: SignInMail): Promise<void> {
    this.log(`[velocity-cms] Sign-in link for ${mail.email} (works once, for ${mail.expiresInMinutes} minutes): ${mail.url}`);
  }

  async sendInvitation(mail: InvitationMail): Promise<void> {
    this.log(`[velocity-cms] ${mail.name} (${mail.email}) was invited. No email was sent: tell them to sign in at ${mail.url}`);
  }
}

/**
 * Everything a site needs to host the editor, wired together: the editor's page, the API it
 * calls and the sign-in behind both, over the site's one database connection. The integration's
 * routes each hand their request to one of the three methods and do nothing else.
 */
/** How often entries due to be published are looked for. */
const DUE_EVERY_MS = 30_000;

export class EditorHost {
  readonly auth: CmsAuth;
  readonly #api: CmsApi;
  readonly #files: AdminFiles;
  readonly #pluginFile: RegExp;
  readonly #plugins: Connection['cms']['plugins'];
  readonly #content: Connection['cms']['content'];
  readonly #onFault: ((error: unknown) => void) | undefined;
  readonly #siteNameNow: (() => Promise<string | null>) | undefined;
  /** When entries due to be published were last looked for. */
  #lookedAt = 0;
  /** Whether anything was published or taken down since `takePublished` was last called. */
  #published = false;
  /** The addresses of the pages that changed with it, where they are known. */
  readonly #changed = new Set<string>();

  constructor(options: EditorHostOptions) {
    const { cms } = options.connection;
    const adminPath = options.adminPath ?? '/admin';
    const apiPath = options.apiPath ?? '/api/cms';
    const authPath = `${apiPath}/auth`;

    this.auth = new CmsAuth({
      db: options.connection.db,
      secret: options.secret,
      origin: options.origin,
      siteName: options.siteName,
      mailer: options.mailer,
      basePath: authPath,
      adminPath,
      access: cms.access,
    });
    if (options.images) cms.media.include(options.images);
    this.#api = new CmsApi({
      cms,
      authenticator: this.auth,
      people: this.auth,
      tokens: this.auth,
      basePath: apiPath,
      ...(options.onFault && { onFault: options.onFault }),
    });
    this.#plugins = cms.plugins;
    this.#content = cms.content;
    this.#onFault = options.onFault;
    this.#siteNameNow = options.siteNameNow;
    // `/admin/plugins/<name>.js`: what a running plugin adds to the editor.
    this.#pluginFile = new RegExp(`^${adminPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/plugins/([a-z][a-z0-9-]{0,39})\\.js$`);
    this.#files = new AdminFiles(options.editorDirectory ?? builtEditorDirectory(), { siteName: options.siteName, adminPath, apiPath, authPath });

    // The site keeps what it read from the CMS for a moment. A publish must be seen at once.
    const published = async ({ entry, before }: { entry: Entry; before: Entry }) => {
      invalidateLiveContent();
      this.#published = true;
      const type = await cms.schema.get(entry.typeId).catch(() => null);
      for (const address of addressesOf(type, [entry, before])) this.#changed.add(address);
    };
    cms.events.on('entry.published', published);
    cms.events.on('entry.unpublished', published);

    // Archiving a type takes every page of it off the site, and restoring brings them back.
    const shown = async ({ type }: { type: ContentTypeDef }) => {
      invalidateLiveContent();
      this.#published = true;
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await cms.content.find(SITE, { typeId: type.id, status: 'published', limit: PAGE_SIZE, offset });
        for (const address of addressesOf(type, page.items)) this.#changed.add(address);
        if (offset + page.items.length >= page.total || page.items.length === 0) break;
      }
    };
    // A plugin changed what pages say about themselves: the copies the site kept are stale.
    cms.events.on('pages.changed', () => {
      invalidateLiveContent();
      this.#published = true;
    });
    // A page that draws a form was kept with the form's fields as they were.
    const formChanged = () => {
      invalidateLiveContent();
      this.#published = true;
    };
    cms.events.on('form.saved', formChanged);
    cms.events.on('form.trashed', formChanged);
    cms.events.on('form.restored', formChanged);
    cms.events.on('form.deleted', formChanged);
    // A page that draws a form was kept with or without the challenge an owner has now set up.
    cms.events.on('settings.saved', ({ area }) => {
      if (area === 'forms') formChanged();
    });
    cms.events.on('type.archived', shown);
    cms.events.on('type.restored', shown);
  }

  /** Answers a request to the API. */
  api(request: Request): Promise<Response> {
    return this.#api.handle(request);
  }

  /** Answers a request to one of the sign-in addresses. */
  signIn(request: Request): Promise<Response> {
    return this.auth.handle(request);
  }

  /**
   * Answers a request for the editor's page or one of its files, which include the file of each
   * running plugin that adds to the editor. A plugin's file is code the site's owner installed,
   * like the editor's own, and holds nothing private; it is never kept by a browser, so a plugin
   * that is switched off or updated is gone or new on the next load.
   */
  async admin(request: Request): Promise<Response> {
    const name = this.#pluginFile.exec(new URL(request.url).pathname)?.[1];
    // A name that cannot be read leaves the page with the one it started with: the editor still opens.
    if (name === undefined) return this.#files.respond(request, await this.#siteNameNow?.().catch(() => null));
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
    const file = await this.#plugins.editorFile(name);
    // Not the editor's page: a browser asked for a script, and would try to run it.
    if (file === null) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
    return new Response(file, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  }

  /**
   * Publishes the entries whose time has come. A site may have no clock of its own, so this is
   * asked on every request and looks at most every half minute; a scheduled job that calls the
   * site (`/api/cms/schedule`) passes `now` to look whenever it asks. It never throws: a page is
   * not lost over a publish that could not be looked for. `takePublished` says what went out.
   */
  async publishDue(options: { readonly now?: boolean } = {}): Promise<void> {
    if (options.now !== true && Date.now() - this.#lookedAt < DUE_EVERY_MS) return;
    this.#lookedAt = Date.now();
    try {
      await this.#content.publishDue();
    } catch (error) {
      this.#onFault?.(error);
    }
  }

  /**
   * What was published or taken down since this was last asked, and forgets it: `null` when
   * nothing was, otherwise the addresses of the entries' own pages. The caller clears its page
   * cache, since any page may show the entry, and reads those pages again for search. The list
   * is empty for a type that has no address pattern.
   */
  takePublished(): string[] | null {
    if (!this.#published) return null;
    const addresses = [...this.#changed];
    this.#published = false;
    this.#changed.clear();
    return addresses;
  }
}

/**
 * Where an entry's own page is, from its type's address pattern: the address visitors find it
 * at now and, if that changed or it was taken down, the one they found it at before. A page in
 * a language the type gives no pattern for is not known here; it is fresh at once all the same,
 * and searched after the next deploy.
 */
function addressesOf(type: ContentTypeDef | null, versions: readonly Entry[]): string[] {
  if (!type) return [];
  const at = (entry: Entry) => (entry.published ? pageAddress(type, { locale: entry.locale, ...entry.published }, DEFAULT_LOCALE) : null);
  return [...new Set(versions.flatMap((entry) => at(entry) ?? []))];
}
