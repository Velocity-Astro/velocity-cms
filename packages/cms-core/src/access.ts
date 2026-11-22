import { ForbiddenError } from './errors.js';

export type Role = 'owner' | 'editor' | 'author';

export type Permission = 'schema:write' | 'entry:read' | 'entry:write' | 'entry:publish' | 'entry:delete' | 'form:write' | 'submission:read' | 'submission:manage' | 'contact:read' | 'contact:manage' | 'user:manage' | 'plugin:manage' | 'settings:manage';

/**
 * Whoever is asking for something: a signed-in person, a plugin, the CLI or an AI agent.
 * All four pass through the same permission checks.
 */
export interface Actor {
  readonly kind: 'user' | 'plugin' | 'cli' | 'agent';
  readonly id: string;
  readonly role: Role;
  /**
   * Exactly what this actor may do, in place of what its role grants. A plugin carries the
   * permissions it declared; people are judged by their role and leave this out.
   */
  readonly permissions?: readonly Permission[];
}

const GRANTS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  owner: new Set(['schema:write', 'entry:read', 'entry:write', 'entry:publish', 'entry:delete', 'form:write', 'submission:read', 'submission:manage', 'contact:read', 'contact:manage', 'user:manage', 'plugin:manage', 'settings:manage']),
  editor: new Set(['entry:read', 'entry:write', 'entry:publish', 'entry:delete', 'form:write', 'submission:read', 'submission:manage', 'contact:read', 'contact:manage']),
  author: new Set(['entry:read', 'entry:write']),
};

/** What a role grants, in a fixed order. */
export function permissionsOf(role: Role): Permission[] {
  return [...GRANTS[role]];
}

/** The roles an access token may act as. Managing people, plugins, settings and content types stays with a person. */
export const TOKEN_ROLES: readonly Role[] = ['editor', 'author'];

/** What an access token may do beyond its role's writing, each ticked by the owner who makes it. */
export interface TokenAllowances {
  /** May publish, unpublish, schedule and delete for good. Left out, what the token writes stays a draft. */
  readonly publish: boolean;
  /** May read and change contacts, deals and what visitors sent, which are personal data. */
  readonly personalData: boolean;
}

const PUBLISHING: ReadonlySet<Permission> = new Set(['entry:publish', 'entry:delete']);
const PERSONAL: ReadonlySet<Permission> = new Set(['submission:read', 'submission:manage', 'contact:read', 'contact:manage']);

/**
 * Exactly what a token may do: its role's grants, less publishing and personal data unless the
 * owner allowed them. Never more than an editor.
 */
export function tokenPermissions(role: Role, allowed: TokenAllowances): Permission[] {
  const base = TOKEN_ROLES.includes(role) ? GRANTS[role] : GRANTS.author;
  return [...base].filter((permission) => (allowed.publish || !PUBLISHING.has(permission)) && (allowed.personalData || !PERSONAL.has(permission)));
}

/** Every role there is, from most to least allowed. */
export const ROLES: readonly Role[] = ['owner', 'editor', 'author'];

export class AccessControl {
  can(actor: Actor, permission: Permission): boolean {
    return actor.permissions ? actor.permissions.includes(permission) : GRANTS[actor.role].has(permission);
  }

  /** Throws unless the actor holds the permission. Every service method calls this first. */
  require(actor: Actor, permission: Permission): void {
    if (!this.can(actor, permission)) {
      throw new ForbiddenError(
        actor.permissions
          ? `The ${actor.kind} "${actor.id}" was not given "${permission}".`
          : `The ${actor.role} role does not allow "${permission}".`,
      );
    }
  }
}
