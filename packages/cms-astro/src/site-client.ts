/**
 * How the `velocity-cms` command reaches a site's content: over the site's own API, with an
 * access token, so it works the same on this computer and on the live site, and goes through
 * every rule, plugin and cache the site has. Content commands call the same tools an AI agent
 * calls over MCP (`/api/cms/mcp`), so the two can never disagree.
 */

/** A refusal from the site, in its own words: what happened and what to do. */
export class SiteRefusal extends Error {
  override readonly name = 'SiteRefusal';
}

export interface SiteClientOptions {
  /** The site's address, such as `https://example.com` or `http://localhost:4321`. */
  readonly origin: string;
  /** An access token, `vcms_…`, made in the editor (Settings, Access tokens) or with `velocity-cms token`. */
  readonly token: string;
  /** Where the API is served. Defaults to `/api/cms`. */
  readonly apiPath?: string;
  readonly fetch?: typeof fetch;
}

const IMAGE_TYPES: Readonly<Record<string, string>> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** The content type an image upload is sent as, from its file's name, or `null` for one the CMS does not take. */
export function imageTypeOf(fileName: string): string | null {
  return IMAGE_TYPES[fileName.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

export class SiteClient {
  readonly #base: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;
  #next = 1;

  constructor(options: SiteClientOptions) {
    this.#base = `${options.origin.replace(/\/+$/, '')}/${(options.apiPath ?? '/api/cms').split('/').filter(Boolean).join('/')}`;
    this.#token = options.token;
    this.#fetch = options.fetch ?? fetch;
  }

  /** Where the site's MCP server is. */
  get mcpAddress(): string {
    return `${this.#base}/mcp`;
  }

  /** Hands one JSON-RPC message to the site's MCP server as it is, and its answer back (`null` for a notification). */
  async relay(message: string): Promise<string | null> {
    const response = await this.#send('/mcp', 'application/json', message);
    if (response.status === 202) return null;
    if (response.ok) return response.text();
    // A refusal in the protocol's own words (a version or a method the server does not have)
    // travels under a 400 or a 404, and is the agent's to read.
    const text = await response.clone().text();
    return text.includes('"jsonrpc"') ? text : (await this.#checked(response)).text();
  }

  /** Calls one of the site's MCP tools and returns what it answered, or throws its refusal. */
  async tool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const response = await this.#post('/mcp', 'application/json', JSON.stringify({ jsonrpc: '2.0', id: this.#next++, method: 'tools/call', params: { name, arguments: args } }));
    const answer = (await response.json()) as { result?: { content?: { text?: string }[]; isError?: boolean }; error?: { message?: string } };
    if (answer.error) throw new SiteRefusal(answer.error.message ?? 'The site refused the request.');
    const text = answer.result?.content?.[0]?.text ?? '';
    if (answer.result?.isError) throw new SiteRefusal(text);
    return JSON.parse(text === '' ? '{}' : text) as T;
  }

  /** Uploads one image. Answers with what an image field stores: its name. */
  async upload(fileName: string, bytes: Uint8Array): Promise<{ readonly name: string; readonly url: string }> {
    const type = imageTypeOf(fileName);
    if (type === null) throw new SiteRefusal(`${fileName} is not an image the CMS takes. Use a JPEG, PNG or WebP file.`);
    const response = await this.#post(`/images?name=${encodeURIComponent(fileName)}`, type, bytes);
    return (await response.json()) as { name: string; url: string };
  }

  async #post(path: string, contentType: string, body: string | Uint8Array): Promise<Response> {
    return this.#checked(await this.#send(path, contentType, body));
  }

  async #send(path: string, contentType: string, body: string | Uint8Array): Promise<Response> {
    try {
      return await this.#fetch(`${this.#base}${path}`, { method: 'POST', headers: { authorization: `Bearer ${this.#token}`, 'content-type': contentType, accept: 'application/json' }, body });
    } catch {
      throw new SiteRefusal(`The site at ${new URL(this.#base).origin} did not answer. Is it running? Start it, or set VELOCITY_CMS_ORIGIN to its address.`);
    }
  }

  /** The response, or the refusal a person can act on. */
  async #checked(response: Response): Promise<Response> {
    if (response.status === 401) throw new SiteRefusal('The site did not accept the token. Make a new one in the editor (Settings, Access tokens) or with `velocity-cms token`, and set VELOCITY_CMS_TOKEN.');
    if (response.status === 404) throw new SiteRefusal(`There is no Velocity CMS at ${new URL(this.#base).origin}, or it is older than this command. Check VELOCITY_CMS_ORIGIN, and update @velocity-astro/cms-astro.`);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new SiteRefusal(body?.error?.message ?? `The site answered ${response.status}.`);
    }
    return response;
  }
}
