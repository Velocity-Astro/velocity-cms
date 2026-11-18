import type { Actor, Role } from '@velocity-astro/cms-core';

/** Someone who can sign in to the editor. */
export interface Person {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
  /** Whether they have ever signed in. Left out by a host that cannot tell. */
  readonly hasSignedIn?: boolean;
}

export interface NewPerson {
  readonly email: string;
  readonly name: string;
  readonly role: Role;
}

/**
 * Who can sign in, and what each may do. Sign-in belongs to `cms-auth`, whose `CmsAuth` is one
 * of these; a host with its own sign-in supplies its own, or none, and the editor then has no
 * People screen. Each method checks for itself that the actor may manage people.
 */
export interface People {
  /** Everyone who can sign in, by name. */
  listUsers(actor: Actor): Promise<Person[]>;
  /** Lets someone in. Refused for an address that is already here. */
  invite(actor: Actor, person: NewPerson): Promise<Person>;
  /** Changes what someone may do. Refused when it would leave the site without an owner. */
  changeRole(actor: Actor, id: string, role: Role): Promise<Person>;
  /** Takes away someone's access, at once. Refused for oneself and for the last owner. */
  remove(actor: Actor, id: string): Promise<void>;
}
