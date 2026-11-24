import { AccessControl, ForbiddenError, NotFoundError, TOKEN_ROLES, ValidationError, type Actor } from '@velocity-astro/cms-core';
import type { AskedConnection, ConnectedApp, ConnectionAnswer } from '../client/admin-client.js';
import type { MemoryPeople } from './memory-people.js';

/** The one app the in-memory site knows: what Claude is to a real one. */
export const SAMPLE_APP = { id: 'sample-app', name: 'Claude', redirect: 'https://claude.ai/api/mcp/auth_callback' } as const;
/** What that app's request for approval carries, as the editor's address holds it. */
export const SAMPLE_APP_QUERY = new URLSearchParams({ response_type: 'code', client_id: SAMPLE_APP.id, redirect_uri: SAMPLE_APP.redirect, code_challenge: 'c'.repeat(43), code_challenge_method: 'S256', state: 'sample-state' }).toString();

/**
 * Connected apps, kept in memory, with the rules a real site's sign-in applies (`cms-auth`'s
 * `AppConnections`): only owners answer an app and take one away, an app must be known and
 * come back where it registered, and it acts as an editor or an author. It stands in for
 * `cms-auth` behind both test clients, and knows one app, `SAMPLE_APP`.
 */
export class MemoryConnections {
  readonly resourceMetadata = 'https://site.test/.well-known/oauth-protected-resource/api/cms/mcp';
  readonly #connections: ConnectedApp[] = [];
  readonly #access = new AccessControl();
  readonly #people: MemoryPeople;
  #made = 0;

  constructor(people: MemoryPeople) {
    this.#people = people;
  }

  #requireOwner(actor: Actor): void {
    if (!this.#access.can(actor, 'user:manage')) throw new ForbiddenError('Only an owner of this site can connect an app. Ask an owner to connect it, or to make you one.');
  }

  #read(query: string): { readonly state: string | null } {
    const params = new URLSearchParams(query);
    if (params.get('client_id') !== SAMPLE_APP.id) throw new ValidationError('This site does not know the app that sent you here. Remove the connection in the app, add it again, and try once more.', []);
    if (params.get('redirect_uri') !== SAMPLE_APP.redirect) throw new ValidationError('The app asked to send you somewhere it did not register, so nothing was connected. Remove the connection in the app, add it again, and try once more.', []);
    return { state: params.get('state') };
  }

  async asked(actor: Actor, query: string): Promise<AskedConnection> {
    this.#requireOwner(actor);
    this.#read(query);
    return { appName: SAMPLE_APP.name, returnsTo: new URL(SAMPLE_APP.redirect).hostname, isLocal: false };
  }

  async answer(actor: Actor, query: string, answer: ConnectionAnswer): Promise<{ readonly redirect: string }> {
    this.#requireOwner(actor);
    const { state } = this.#read(query);
    const back = new URL(SAMPLE_APP.redirect);
    if (state !== null) back.searchParams.set('state', state);
    if (!answer.allow) {
      back.searchParams.set('error', 'access_denied');
      return { redirect: back.href };
    }
    if (!TOKEN_ROLES.includes(answer.role)) {
      const message = `An app acts as ${TOKEN_ROLES.join(' or ')}. People, plugins and settings stay with a person.`;
      throw new ValidationError(message, [{ path: ['role'], message }]);
    }
    this.#made += 1;
    const by = (await this.#people.members()).find((member) => member.id === actor.id);
    this.#connections.push({
      id: `connection-${this.#made}`,
      name: SAMPLE_APP.name,
      returnsTo: back.hostname,
      role: answer.role,
      publish: answer.publish,
      personalData: answer.personalData,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
      connectedBy: by?.name ?? '',
    });
    back.searchParams.set('code', `memory-code-${this.#made}`);
    return { redirect: back.href };
  }

  async listConnections(actor: Actor): Promise<ConnectedApp[]> {
    this.#access.require(actor, 'user:manage');
    return [...this.#connections].reverse();
  }

  async disconnect(actor: Actor, id: string): Promise<void> {
    this.#access.require(actor, 'user:manage');
    const index = this.#connections.findIndex((connection) => connection.id === id);
    if (index < 0) throw new NotFoundError('Connected app', id);
    this.#connections.splice(index, 1);
  }
}
