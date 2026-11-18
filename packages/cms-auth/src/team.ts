import { ROLES, type Role, type Team, type TeamMember } from '@velocity/cms-core';
import { authUser, type Db } from '@velocity/cms-db';

const isRole = (value: unknown): value is Role => ROLES.includes(value as Role);

/**
 * Who is on the team, for the CMS to give work to: ids, names and roles, and no email. It reads
 * the sign-in table and nothing of the sign-in library, so a site can hand it to the CMS as soon
 * as its database is open.
 */
export class AuthTeam implements Team {
  constructor(private readonly db: Db) {}

  async members(): Promise<TeamMember[]> {
    const rows = await this.db.select({ id: authUser.id, name: authUser.name, role: authUser.role }).from(authUser);
    // A role this version does not know grants nothing, so it is the least there is.
    return rows.map(({ id, name, role }) => ({ id, name, role: isRole(role) ? role : ('author' as const) })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }
}
