import { ForbiddenError } from './errors.js';

export type Role = 'owner' | 'editor' | 'author';

export type Permission = 'schema:write' | 'entry:read' | 'entry:write' | 'entry:publish' | 'entry:delete' | 'user:manage' | 'plugin:manage';

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
  owner: new Set(['schema:write', 'entry:read', 'entry:write', 'entry:publish', 'entry:delete', 'user:manage', 'plugin:manage']),
  editor: new Set(['entry:read', 'entry:write', 'entry:publish', 'entry:delete']),
  author: new Set(['entry:read', 'entry:write']),
};

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
