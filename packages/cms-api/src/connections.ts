import type { Actor, Role } from '@velocity-astro/cms-core';

/** An app that asks to be connected, as the person who decides is shown it. */
export interface AskedConnection {
  /** What the app calls itself. It chose the name, so it is shown as a claim, beside where it leads. */
  readonly appName: string;
  /** The host the person is sent back to afterwards, such as `claude.ai`, or `this computer`'s own name for an app that runs on it. */
  readonly returnsTo: string;
  /** Whether that host is the person's own computer rather than a site. */
  readonly isLocal: boolean;
}

/** What the person decided: no, or yes with what the app may do. */
export type ConnectionAnswer =
  | { readonly allow: false }
  | {
      readonly allow: true;
      /** `editor` or `author`. */
      readonly role: Role;
      /** Whether it may publish. Without it, what it writes stays a draft. */
      readonly publish: boolean;
      /** Whether it may read and change contacts, deals and what visitors sent. */
      readonly personalData: boolean;
    };

/** An app an owner connected, as the editor lists it. */
export interface ConnectedApp {
  readonly id: string;
  readonly name: string;
  /** The host it was sent back to when it was connected. */
  readonly returnsTo: string;
  readonly role: Role;
  readonly publish: boolean;
  readonly personalData: boolean;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
  /** Who connected it, by name. */
  readonly connectedBy: string;
}

/**
 * Apps that connect by themselves (OAuth), such as Claude or ChatGPT given the site's MCP
 * address. `cms-auth`'s `CmsAuth` is one of these. The app's own side of it (finding the
 * addresses, registering, trading a code for tokens) is not JSON from the site's own pages and
 * is not served by the API: the host mounts it. What is here is the person's side, from the
 * editor. Each method checks for itself that the actor may manage people.
 */
export interface Connections {
  /**
   * Where a request with no session is told to look to learn how to sign in (RFC 9728), made
   * for the configured site. The API names it when it refuses a request to the MCP server.
   */
  readonly resourceMetadata: string;
  /** Reads what an app asked for, from the query its request for approval carried, and refuses one that is not sound. */
  asked(actor: Actor, query: string): Promise<AskedConnection>;
  /** Records the person's answer, and says where their browser goes next: back to the app. */
  answer(actor: Actor, query: string, answer: ConnectionAnswer): Promise<{ readonly redirect: string }>;
  /** Every connected app that still renews itself, newest first. */
  listConnections(actor: Actor): Promise<ConnectedApp[]>;
  /** Takes a connection away, at once. */
  disconnect(actor: Actor, id: string): Promise<void>;
}
