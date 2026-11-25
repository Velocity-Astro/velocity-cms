import type { AccessControl, Actor } from '../access.js';
import type { EntryPresence, Presence } from '../model.js';
import type { Clock, PresenceStore } from '../ports.js';
import type { ContentService } from './content-service.js';

/** How long someone with an entry open in the editor is counted as there after their editor last said so, in milliseconds. */
export const PRESENCE_EDITOR_MS = 30_000;
/** How long an agent is counted as at an entry after it last read or changed it, in milliseconds: an agent works in bursts. */
export const PRESENCE_AGENT_MS = 120_000;
/** The longest name kept for someone who is there. */
export const MAX_PRESENCE_NAME_LENGTH = 80;

/**
 * Who is at an entry now, so that people who work on one page at the same time (two people, or a
 * person and their agent) know of each other.
 *
 * This is no content: nothing here is saved with history or announced, it is forgotten after
 * seconds, and it never reaches the site. It is read and written only by those who may read
 * entries.
 */
export class PresenceService {
  constructor(
    private readonly store: PresenceStore,
    private readonly content: ContentService,
    private readonly access: AccessControl,
    private readonly clock: Clock,
  ) {}

  /** An editor says it has an entry open, and learns the entry's revision and who else is there. */
  async here(actor: Actor, entryId: string, name: string): Promise<EntryPresence> {
    // Refuses whoever may not read entries, and an entry that is not there.
    const entry = await this.content.get(actor, entryId);
    const now = this.clock.now();
    if (actor.kind === 'user') await this.store.mark(this.presence(actor, entryId, name, 'user', PRESENCE_EDITOR_MS, now), now);
    const others = (await this.store.at(entryId, now))
      .filter((one) => one.actorId !== actor.id)
      .sort((a, b) => a.name.localeCompare(b.name) || a.actorId.localeCompare(b.actorId))
      .map((one) => ({ id: one.actorId, kind: one.kind, name: one.name }));
    return { revision: entry.revision, others };
  }

  /** An agent read or changed an entry: whoever has it open sees that it is at work there. */
  async touched(actor: Actor, entryId: string, name: string): Promise<void> {
    if (actor.kind !== 'agent' || !this.access.can(actor, 'entry:read')) return;
    const now = this.clock.now();
    await this.store.mark(this.presence(actor, entryId, name, 'agent', PRESENCE_AGENT_MS, now), now);
  }

  private presence(actor: Actor, entryId: string, name: string, kind: Presence['kind'], forMs: number, now: string): Presence {
    return { entryId, actorId: actor.id, kind, name: name.trim().slice(0, MAX_PRESENCE_NAME_LENGTH), until: new Date(Date.parse(now) + forMs).toISOString() };
  }
}
