import { ForbiddenError } from './errors.js';

export type Role = 'owner' | 'editor' | 'author';

export type Permission = 'schema:write' | 'entry:read' | 'entry:write' | 'entry:publish' | 'user:manage';

/**
 * Whoever is asking for something: a signed-in person, a plugin, the CLI or an AI agent.
 * All four pass through the same permission checks.
 */
export interface Actor {
  readonly kind: 'user' | 'plugin' | 'cli' | 'agent';
  readonly id: string;
  readonly role: Role;
}

const GRANTS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  owner: new Set(['schema:write', 'entry:read', 'entry:write', 'entry:publish', 'user:manage']),
  editor: new Set(['entry:read', 'entry:write', 'entry:publish']),
  author: new Set(['entry:read', 'entry:write']),
};

/** Every role there is, from most to least allowed. */
export const ROLES: readonly Role[] = ['owner', 'editor', 'author'];

export class AccessControl {
  can(actor: Actor, permission: Permission): boolean {
    return GRANTS[actor.role].has(permission);
  }

  /** Throws unless the actor holds the permission. Every service method calls this first. */
  require(actor: Actor, permission: Permission): void {
    if (!this.can(actor, permission)) {
      throw new ForbiddenError(`The ${actor.role} role does not allow "${permission}".`);
    }
  }
}
