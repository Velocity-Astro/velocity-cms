/**
 * The browser's side of sign-in. It talks to the addresses `CmsAuth.handle` answers, and to the
 * browser's own passkey prompt. Nothing here runs on the server, and nothing from the server is
 * imported, so the editor's bundle stays small.
 */

/** The person signed in, as the editor shows them. */
export interface SignedInUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface AuthClientOptions {
  /** Where sign-in is mounted. Defaults to `/api/cms/auth`. */
  readonly basePath?: string;
  /** Where the editor is mounted, which is where a sign-in link lands. Defaults to `/admin`. */
  readonly adminPath?: string;
  /** Defaults to the browser's own `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

/** What the editor's `HttpAdminClient` takes as `auth`, plus adding a passkey once signed in. */
export interface AuthClient {
  requestSignInLink(email: string): Promise<void>;
  signInWithPasskey(): Promise<SignedInUser>;
  signOut(): Promise<void>;
  /** Adds a passkey for the person signed in. `name` tells their passkeys apart: "Work laptop". */
  registerPasskey(name: string): Promise<void>;
}

/** Signing in could not be completed. The message can be shown as it is. */
export class SignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignInError';
  }
}

export function createAuthClient(options: AuthClientOptions = {}): AuthClient {
  const basePath = (options.basePath ?? '/api/cms/auth').replace(/\/+$/, '');
  const adminPath = options.adminPath ?? '/admin';
  const send = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function call(path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await send(`${basePath}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', ...(body !== undefined && { 'content-type': 'application/json' }) },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch {
      throw new SignInError('The server could not be reached. Check your connection and try again.');
    }
    const answer: unknown = await response.json().catch(() => null);
    if (response.ok) return answer;
    if (response.status === 429) throw new SignInError('Too many attempts. Wait a minute, then try again.');
    throw new SignInError('Signing in did not work. Try again, or ask for a new sign-in link.');
  }

  /** The browser's passkey support, or an explanation of why it cannot be used here. */
  function passkeys(): typeof PublicKeyCredential {
    if (typeof PublicKeyCredential === 'undefined' || typeof PublicKeyCredential.parseRequestOptionsFromJSON !== 'function') {
      throw new SignInError('This browser cannot use passkeys. Use a sign-in link instead.');
    }
    return PublicKeyCredential;
  }

  return {
    async requestSignInLink(email) {
      // The answer is the same whether or not the address belongs to someone.
      await call('/sign-in/magic-link', { email, callbackURL: adminPath, errorCallbackURL: `${adminPath}/sign-in?link=expired` });
    },

    async signInWithPasskey() {
      const support = passkeys();
      const offered = (await call('/passkey/generate-authenticate-options')) as PublicKeyCredentialRequestOptionsJSON;
      const credential = (await navigator.credentials.get({ publicKey: support.parseRequestOptionsFromJSON(offered) })) as PublicKeyCredential | null;
      if (!credential) throw new SignInError('No passkey was chosen.');
      await call('/passkey/verify-authentication', { response: credential.toJSON() });
      const session = (await call('/get-session')) as { user?: SignedInUser } | null;
      if (!session?.user) throw new SignInError('Signing in did not work. Try again, or ask for a new sign-in link.');
      const { id, email, name } = session.user;
      return { id, email, name };
    },

    async signOut() {
      await call('/sign-out', {});
    },

    async registerPasskey(name) {
      const support = passkeys();
      const offered = (await call('/passkey/generate-register-options')) as PublicKeyCredentialCreationOptionsJSON;
      const credential = (await navigator.credentials.create({ publicKey: support.parseCreationOptionsFromJSON(offered) })) as PublicKeyCredential | null;
      if (!credential) throw new SignInError('No passkey was created.');
      await call('/passkey/verify-registration', { response: credential.toJSON(), name });
    },
  };
}
