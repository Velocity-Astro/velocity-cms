import type { AccessControl, Actor } from '../access.js';
import type { EntryPresence, Presence, PresenceSaid, PresentOther } from '../model.js';
import type { Clock, PresenceStore } from '../ports.js';
import type { ContentService } from './content-service.js';

/** How long someone with an entry open in the editor is counted as there after their editor last said so, in milliseconds. */
export const PRESENCE_EDITOR_MS = 30_000;
/** How long an agent is counted as at an entry after it last read or changed it, in milliseconds: an agent works in bursts. */
export const PRESENCE_AGENT_MS = 120_000;
/** The longest name kept for someone who is there. */
export const MAX_PRESENCE_NAME_LENGTH = 80;
/** The longest place in an entry kept for someone who is there. */
export const MAX_PRESENCE_PLACE_LENGTH = 200;
/** What a place may be made of: ids, with a slash between them. Anything else is no place. */
const PLACE = /^[\w-]+(\/[\w-]+)*$/;

/** The id an agent is marked under when it works in a person's own session, as that person. */
export const sessionAgentId = (personId: string) => `${personId}:agent`;

const shown = (one: Presence): PresentOther => ({ id: one.actorId, kind: one.kind, name: one.name, ...(one.at !== undefined && { at: one.at }), ...(one.of !== undefined && { of: one.of }) });

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

  /**
   * An editor says it has an entry open, and where in it its person is. It learns the entry's
   * revision, who else is there and, when it holds an older revision, who saved since.
   */
  async here(actor: Actor, entryId: string, name: string, said: PresenceSaid = {}): Promise<EntryPresence> {
    // Refuses whoever may not read entries, and an entry that is not there.
    const entry = await this.content.get(actor, entryId);
    const now = this.clock.now();
    const at = said.at !== undefined && said.at.length <= MAX_PRESENCE_PLACE_LENGTH && PLACE.test(said.at) ? said.at : undefined;
    if (actor.kind === 'user') await this.store.mark({ ...this.presence(actor.id, entryId, name, 'user', PRESENCE_EDITOR_MS, now), ...(at !== undefined && { at }) }, now);
    const marks = await this.store.at(entryId, now);
    const others = marks
      .filter((one) => one.actorId !== actor.id)
      .sort((a, b) => a.name.localeCompare(b.name) || a.actorId.localeCompare(b.actorId))
      .map(shown);
    if (said.revision === undefined || said.revision >= entry.revision) return { revision: entry.revision, others };
    // Asked only when the entry moved on, which is seldom: the history is not read every few seconds.
    const held = said.revision;
    const savers = [...new Set((await this.content.history(actor, entryId)).filter((revision) => revision.revision > held).sort((a, b) => b.revision - a.revision).map((revision) => revision.actorId))];
    const savedBy = savers.map((id): PresentOther => {
      // An agent in the asker's own session saves as the asker: while it is marked as at work here, the save is taken as its.
      const mark = marks.find((one) => one.actorId === (id === actor.id ? sessionAgentId(id) : id));
      if (mark) return shown(mark);
      return { id, kind: 'user', name: id === actor.id ? name.trim().slice(0, MAX_PRESENCE_NAME_LENGTH) : '' };
    });
    return { revision: entry.revision, others, savedBy };
  }

  /**
   * An agent read or changed an entry: whoever has it open sees that it is at work there. An agent
   * with a token of its own is marked by that token's name. One that works in a person's own
   * session (their browser, signed in as them) is that person to the CMS: it is marked as their
   * agent, under an id of its own, so the person sees it too.
   */
  async touched(actor: Actor, entryId: string, name: string): Promise<void> {
    if ((actor.kind !== 'agent' && actor.kind !== 'user') || !this.access.can(actor, 'entry:read')) return;
    const now = this.clock.now();
    const mark = actor.kind === 'agent' ? this.presence(actor.id, entryId, name, 'agent', PRESENCE_AGENT_MS, now) : { ...this.presence(sessionAgentId(actor.id), entryId, name, 'agent', PRESENCE_AGENT_MS, now), of: actor.id };
    await this.store.mark(mark, now);
  }

  private presence(actorId: string, entryId: string, name: string, kind: Presence['kind'], forMs: number, now: string): Presence {
    return { entryId, actorId, kind, name: name.trim().slice(0, MAX_PRESENCE_NAME_LENGTH), until: new Date(Date.parse(now) + forMs).toISOString() };
  }
}
