import { AuthSetupError, type Mailer } from '@velocity-astro/cms-auth';
import { ConflictError, type ImageLibrary } from '@velocity-astro/cms-core';
import { sharedConnection } from './connection.js';
import { EditorHost, LogMailer } from './editor.js';
import { currentSite } from './hosted.js';
import { SiteMail } from './site-mail.js';
import { siteNameNow } from './site-name.js';
import { siteSecret } from './secret.js';

/** What the integration tells the editor's routes about the site. */
export interface SiteEditorSettings {
  /** `site` from the Astro config, if it is set. */
  readonly site: string | undefined;
  /** Whether this is `astro dev`. */
  readonly dev: boolean;
  readonly siteName: string;
  readonly adminPath: string;
  /** How sign-in links are delivered. Without one they are printed to the server's log. */
  readonly mailer?: Mailer | undefined;
  /** The site's images, for image fields. Without them there are none to choose from. */
  readonly images?: ImageLibrary | undefined;
}

/** The editor cannot be served until the site's settings are completed. The message says how. */
export class EditorNotSetUpError extends Error {}

/**
 * The address sign-in links and passkeys are made for. It is never taken from a request on a
 * deployed site: whoever sends a request chooses its `Host` header, and a link built from it
 * would carry a real person's sign-in to an address of the sender's choosing.
 */
export function editorOrigin(request: Request, settings: Pick<SiteEditorSettings, 'site' | 'dev'>): string {
  // On a server that runs many sites, the address is the one its host keeps for the site.
  const hosted = currentSite();
  if (hosted) return new URL(hosted.origin).origin;
  const configured = process.env.VELOCITY_CMS_ORIGIN || (settings.dev ? new URL(request.url).origin : settings.site);
  if (!configured) {
    throw new EditorNotSetUpError(
      'The editor needs to know the site\'s address. Set `site` in astro.config.mjs, or the VELOCITY_CMS_ORIGIN environment variable.',
    );
  }
  try {
    return new URL(configured).origin;
  } catch {
    throw new EditorNotSetUpError(`"${configured}" is not an address. Give the site's own, such as https://example.com.`);
  }
}

/** The names a host gives a deployment itself. A visitor cannot set them. */
const PLATFORM_HOSTS = ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'URL', 'DEPLOY_PRIME_URL', 'DEPLOY_URL'] as const;

const hostOf = (address: string | undefined): string | null => {
  if (!address) return null;
  const full = address.includes('://') ? address : `https://${address}`;
  return URL.canParse(full) ? new URL(full).host : null;
};

/**
 * The address the site reads its own pages from, for search and share images, or `null` when it
 * cannot tell. The request's own address is used only when the site is known by it: whoever
 * sends a request chooses its `Host` header, and a page read from an address of their choosing
 * would be someone else's page, or a machine beside the site.
 */
export function pagesOrigin(request: Request, settings: Pick<SiteEditorSettings, 'site' | 'dev'>): string | null {
  const asked = new URL(request.url);
  const hosted = currentSite();
  if (hosted) return new URL(hosted.origin).origin;
  if (settings.dev) return asked.origin;
  const configured = [process.env.VELOCITY_CMS_ORIGIN, settings.site].map(hostOf);
  const known = [...configured, ...PLATFORM_HOSTS.map((name) => hostOf(process.env[name]))];
  if (known.includes(asked.host)) return asked.origin;
  try {
    return editorOrigin(request, settings);
  } catch {
    return null;
  }
}

const hosts = new Map<string, Promise<EditorHost>>();

async function createHost(origin: string, settings: SiteEditorSettings): Promise<EditorHost> {
  const secret = siteSecret();
  if (!secret) {
    throw new EditorNotSetUpError(
      'The editor is off because VELOCITY_CMS_SECRET is not set. Set it to at least 32 random characters, for example from `openssl rand -base64 32`.',
    );
  }
  try {
    const connection = await sharedConnection({});
    const hosted = currentSite();
    // A host names its sites. Otherwise the name an owner saved, then the one the site's code gives.
    const named = hosted ? undefined : () => siteNameNow(connection.cms);
    const siteName = hosted?.name ?? (await named?.()) ?? settings.siteName;
    // The site's own mailer first, then Resend from the server's settings, then what an owner set up in the editor, then the server's log.
    const mail = new SiteMail({ settings: connection.cms.settings, own: settings.mailer, fallback: new LogMailer(), hosted: hosted !== undefined, ...(named && { siteName: named }) });
    connection.cms.settings.useSite({ defaultName: hosted?.name ?? settings.siteName, fixedBy: hosted ? 'host' : null });
    const host = new EditorHost({
      connection,
      secret,
      origin,
      siteName,
      ...(named && { siteNameNow: named }),
      adminPath: settings.adminPath,
      mailer: mail,
      ...(settings.images && { images: settings.images }),
      onFault: (error) => console.error('[velocity-cms]', error),
    });
    connection.cms.settings.useMail({
      fixedBy: () => mail.fixedBy(),
      canTest: () => mail.canTest(),
      // The test goes to the address the person signs in with, which only sign-in knows.
      sendTest: async (actor) => {
        const person = (await host.auth.listUsers(actor)).find((user) => user.id === actor.id);
        if (!person) throw new ConflictError('A test email goes to the person who asks for it, and only someone signed in has an address to send it to.');
        await mail.sendTest({ email: person.email, name: person.name, siteName: hosted?.name ?? settings.siteName });
      },
    });
    return host;
  } catch (error) {
    if (error instanceof AuthSetupError) throw new EditorNotSetUpError(error.message);
    throw error;
  }
}

/** The site's one editor host for the life of the server, made on first use. */
export function siteEditorHost(request: Request, settings: SiteEditorSettings): Promise<EditorHost> {
  const origin = editorOrigin(request, settings);
  let host = hosts.get(origin);
  if (!host) {
    host = createHost(origin, settings);
    hosts.set(origin, host);
    // A failed start must not be remembered: the next request tries again with the settings fixed.
    host.catch(() => hosts.delete(origin));
  }
  return host;
}

/**
 * Hands a request to the site's editor host. When the editor is not set up yet, answers with
 * what is missing instead, in the shape the API's errors have, so the person setting the site
 * up reads it in the browser and in the log.
 */
export async function withEditor(
  request: Request,
  settings: SiteEditorSettings,
  answer: (host: EditorHost) => Response | Promise<Response>,
): Promise<Response> {
  let host: EditorHost;
  try {
    host = await siteEditorHost(request, settings);
  } catch (error) {
    if (!(error instanceof EditorNotSetUpError)) throw error;
    console.warn(`[velocity-cms] ${error.message}`);
    return Response.json({ error: { code: 'not_set_up', message: error.message } }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  return answer(host);
}
