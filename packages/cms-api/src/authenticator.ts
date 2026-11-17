import type { Actor } from '@velocity/cms-core';

/** The person a request comes from, as the editor shows them. */
export interface ApiUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface ApiSession {
  readonly user: ApiUser;
  /** Who the CMS treats the request as coming from. Its role decides what the request may do. */
  readonly actor: Actor;
}

/**
 * Works out who a request comes from. The API never looks at cookies or tokens itself: sign-in
 * belongs to `cms-auth`, and a host can supply its own.
 */
export interface Authenticator {
  /** The session the request carries, or `null` when it carries none that is valid. */
  authenticate(request: Request): Promise<ApiSession | null>;
}
