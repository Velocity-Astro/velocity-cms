import { AccessControl, NotFoundError, TOKEN_ROLES, ValidationError, type Actor } from '@velocity-astro/cms-core';
import type { AccessToken, MadeAccessToken, NewAccessToken } from '../client/admin-client.js';
import type { MemoryPeople } from './memory-people.js';

const DAY_MS = 24 * 60 * 60_000;

/**
 * Access tokens, kept in memory, with the rules a real site's sign-in applies (`cms-auth`'s
 * `AccessTokens`): only owners make and take them away, a token acts as an editor or an author,
 * has a name and lasts from 1 to 365 days. It stands in for `cms-auth` behind both test clients.
 */
export class MemoryTokens {
  readonly #tokens: AccessToken[] = [];
  readonly #access = new AccessControl();
  readonly #people: MemoryPeople;
  #made = 0;

  constructor(people: MemoryPeople) {
    this.#people = people;
  }

  async listTokens(actor: Actor): Promise<AccessToken[]> {
    this.#access.require(actor, 'user:manage');
    return [...this.#tokens].reverse();
  }

  async createToken(actor: Actor, input: NewAccessToken): Promise<MadeAccessToken> {
    this.#access.require(actor, 'user:manage');
    const name = input.name.trim();
    const issues = [
      ...(name === '' || name.length > 200 ? [{ path: ['name'], message: 'Say what the token is for, in 200 characters or fewer, such as "Claude on my laptop".' }] : []),
      ...(TOKEN_ROLES.includes(input.role) ? [] : [{ path: ['role'], message: `A token acts as ${TOKEN_ROLES.join(' or ')}. People, plugins and settings stay with a person.` }]),
      ...(Number.isInteger(input.days) && input.days >= 1 && input.days <= 365 ? [] : [{ path: ['days'], message: 'A token works for 1 to 365 days.' }]),
    ];
    const [first] = issues;
    if (first) throw new ValidationError(first.message, issues);
    this.#made += 1;
    const secret = `vcms_memory-token-${String(this.#made).padStart(4, '0')}`;
    const maker = (await this.#people.members()).find((member) => member.id === actor.id);
    const token: AccessToken = {
      id: `token-${this.#made}`,
      name,
      hint: secret.slice(-4),
      role: input.role,
      publish: input.publish,
      personalData: input.personalData,
      expiresAt: new Date(Date.now() + input.days * DAY_MS).toISOString(),
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
      madeBy: maker?.name ?? null,
    };
    this.#tokens.push(token);
    return { token, secret };
  }

  async revokeToken(actor: Actor, id: string): Promise<void> {
    this.#access.require(actor, 'user:manage');
    const index = this.#tokens.findIndex((token) => token.id === id);
    if (index < 0) throw new NotFoundError('Access token', id);
    this.#tokens.splice(index, 1);
  }
}
