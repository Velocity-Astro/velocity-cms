import { AuthSetupError, type Mailer } from '@velocity/cms-auth';
import { sharedConnection } from './connection.js';
import { EditorHost, LogMailer } from './editor.js';
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
}

/** The editor cannot be served until the site's settings are completed. The message says how. */
export class EditorNotSetUpError extends Error {}

/**
 * The address sign-in links and passkeys are made for. It is never taken from a request on a
 * deployed site: whoever sends a request chooses its `Host` header, and a link built from it
 * would carry a real person's sign-in to an address of the sender's choosing.
 */
export function editorOrigin(request: Request, settings: Pick<SiteEditorSettings, 'site' | 'dev'>): string {
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

const hosts = new Map<string, Promise<EditorHost>>();

async function createHost(origin: string, settings: SiteEditorSettings): Promise<EditorHost> {
  const secret = siteSecret();
  if (!secret) {
    throw new EditorNotSetUpError(
      'The editor is off because VELOCITY_CMS_SECRET is not set. Set it to at least 32 random characters, for example from `openssl rand -base64 32`.',
    );
  }
  try {
    return new EditorHost({
      connection: await sharedConnection({}),
      secret,
      origin,
      siteName: settings.siteName,
      adminPath: settings.adminPath,
      mailer: settings.mailer ?? new LogMailer(),
      onFault: (error) => console.error('[velocity-cms]', error),
    });
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
