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
  /** Changes what someone is called. */
  rename(actor: Actor, id: string, name: string): Promise<Person>;
}

/** The signed-in person as they see themselves on their profile. */
export interface Profile {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
  /** Their photo, as a small image in a `data:` address. Left out when they have none. */
  readonly image?: string;
}

export interface ProfileChanges {
  readonly name?: string;
  /** A small photo as a `data:` address, or `null` to take it away. Left out, it stays. */
  readonly image?: string | null;
}

/**
 * Each person's own details, which they change themselves. Only a person signed in has a
 * profile: an access token has none. A new email address counts only once a link sent to it is
 * opened by the same person.
 */
export interface Profiles {
  profile(actor: Actor): Promise<Profile>;
  updateProfile(actor: Actor, changes: ProfileChanges): Promise<Profile>;
  /** Emails a link to the new address. Nothing changes until it is opened. */
  askEmailChange(actor: Actor, email: string): Promise<void>;
  /** Uses the link's token: the address it was sent to becomes the person's. */
  confirmEmailChange(actor: Actor, token: string): Promise<Profile>;
}
