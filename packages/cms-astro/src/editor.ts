import { CmsApi } from '@velocity/cms-api';
import { CmsAuth, type Mailer, type SignInMail } from '@velocity/cms-auth';
import type { ContentTypeDef, Entry } from '@velocity/cms-core';
import { AdminFiles, builtEditorDirectory } from './admin-files.js';
import type { Connection } from './connection.js';
import { invalidateLiveContent } from './live-loader.js';

export interface EditorHostOptions {
  readonly connection: Connection;
  /** The site's secret, `VELOCITY_CMS_SECRET`. It signs sessions and sign-in links. */
  readonly secret: string;
  /** The site's own address, such as `https://example.com`. */
  readonly origin: string;
  readonly siteName: string;
  readonly mailer: Mailer;
  /** Where the editor is served. Defaults to `/admin`. */
  readonly adminPath?: string;
  /** Where the API is served. Defaults to `/api/cms`; sign-in sits under it at `/auth`. */
  readonly apiPath?: string;
  /** Where the built editor is. Defaults to the one `@velocity/cms-admin` ships. */
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
}

/**
 * Everything a site needs to host the editor, wired together: the editor's page, the API it
 * calls and the sign-in behind both, over the site's one database connection. The integration's
 * routes each hand their request to one of the three methods and do nothing else.
 */
export class EditorHost {
  readonly auth: CmsAuth;
  readonly #api: CmsApi;
  readonly #files: AdminFiles;
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
    this.#api = new CmsApi({ cms, authenticator: this.auth, basePath: apiPath, ...(options.onFault && { onFault: options.onFault }) });
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
  }

  /** Answers a request to the API. */
  api(request: Request): Promise<Response> {
    return this.#api.handle(request);
  }

  /** Answers a request to one of the sign-in addresses. */
  signIn(request: Request): Promise<Response> {
    return this.auth.handle(request);
  }

  /** Answers a request for the editor's page or one of its files. */
  admin(request: Request): Response {
    return this.#files.respond(request);
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
 * at now and, if that changed or it was taken down, the one they found it at before. Pages in
 * other languages with translated addresses are not known here yet; they are fresh at once all
 * the same, and searched after the next deploy.
 */
function addressesOf(type: ContentTypeDef | null, versions: readonly Entry[]): string[] {
  if (!type?.urlPattern) return [];
  const pattern = type.urlPattern;
  const at = (slug: string) => `${pattern.replace('[slug]', slug).replace(/\/+$/, '')}/`;
  return [...new Set(versions.flatMap((entry) => (entry.published ? [at(entry.published.slug)] : [])))];
}
