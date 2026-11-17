import type { ApiSession, Authenticator } from '../authenticator.js';

/**
 * An `Authenticator` that treats every request as coming from one session, or from nobody. For
 * tests and local previews only: it checks nothing.
 */
export class FixedAuthenticator implements Authenticator {
  constructor(public session: ApiSession | null) {}

  async authenticate(): Promise<ApiSession | null> {
    return this.session;
  }
}
