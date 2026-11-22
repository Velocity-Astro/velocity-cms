import type { Actor, Role } from '@velocity-astro/cms-core';

/** An access token as an owner sees it in the editor. The token itself is never shown again. */
export interface AccessToken {
  readonly id: string;
  /** What it is for, such as "Claude on Michael's laptop". */
  readonly name: string;
  /** Its last four characters, to tell one from another. */
  readonly hint: string;
  /** `editor` or `author`. */
  readonly role: Role;
  /** Whether it may publish. Without it, what it writes stays a draft. */
  readonly publish: boolean;
  /** Whether it may read and change contacts, deals and what visitors sent. */
  readonly personalData: boolean;
  readonly expiresAt: string;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
  /** Who made it, by name, or `null` for one made from the command line. */
  readonly madeBy: string | null;
}

export interface NewAccessToken {
  readonly name: string;
  readonly role: Role;
  readonly publish: boolean;
  readonly personalData: boolean;
  /** How many days it works for, from 1 to 365. */
  readonly days: number;
}

/** A token that was just made: what to show, and the token, which is shown this once. */
export interface MadeAccessToken {
  readonly token: AccessToken;
  readonly secret: string;
}

/**
 * Access tokens, for agents and scripts that reach the API without a browser. `cms-auth`'s
 * `CmsAuth` is one of these. Each method checks for itself that the actor may manage people.
 */
export interface Tokens {
  /** Every token that has not ended, newest first. */
  listTokens(actor: Actor): Promise<AccessToken[]>;
  createToken(actor: Actor, token: NewAccessToken): Promise<MadeAccessToken>;
  /** Takes a token away, at once. */
  revokeToken(actor: Actor, id: string): Promise<void>;
}
