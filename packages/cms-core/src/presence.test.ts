import { beforeEach, expect, it } from 'vitest';
import type { Actor } from './access.js';
import { createCms, type Cms } from './cms.js';
import { ForbiddenError, NotFoundError } from './errors.js';
import type { Entry } from './model.js';
import type { Clock } from './ports.js';
import { PRESENCE_AGENT_MS, PRESENCE_EDITOR_MS } from './services/presence-service.js';
import { InMemoryEntryRepository, InMemoryPresenceStore, InMemorySchemaRepository, SequentialIds, presenceStoreContract } from './testing/index.js';

presenceStoreContract('InMemoryPresenceStore', async () => new InMemoryPresenceStore());

const maya: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const daniel: Actor = { kind: 'user', id: 'daniel', role: 'editor' };
const agent: Actor = { kind: 'agent', id: 'token-1', role: 'editor', permissions: ['entry:read', 'entry:write'] };

/** A clock that moves only when told to. */
class StillClock implements Clock {
  #time = Date.parse('2026-01-01T12:00:00.000Z');
  now = () => new Date(this.#time).toISOString();
  pass(ms: number) {
    this.#time += ms;
  }
}

let cms: Cms;
let clock: StillClock;
let page: Entry;

beforeEach(async () => {
  clock = new StillClock();
  cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock, ids: new SequentialIds() });
  const pages = await cms.schema.create(maya, { key: 'pages', kind: 'collection', label: { en: 'Pages' }, fields: [{ key: 'title', type: 'text', label: { en: 'Title' } }] });
  page = await cms.content.create(maya, { typeId: pages.id, locale: 'en', slug: 'home', data: {} });
});

it('tells an open editor the revision of its entry and who else has it open, never itself', async () => {
  expect(await cms.presence.here(maya, page.id, 'Maya Ellison')).toEqual({ revision: page.revision, others: [] });
  expect(await cms.presence.here(daniel, page.id, 'Daniel Reyes')).toEqual({ revision: page.revision, others: [{ id: 'maya', kind: 'user', name: 'Maya Ellison' }] });
  expect((await cms.presence.here(maya, page.id, 'Maya Ellison')).others).toEqual([{ id: 'daniel', kind: 'user', name: 'Daniel Reyes' }]);

  const saved = await cms.content.update(daniel, page.id, { slug: 'home', data: {}, expectedRevision: page.revision });
  expect((await cms.presence.here(maya, page.id, 'Maya Ellison')).revision).toBe(saved.revision);
});

it('forgets someone whose editor stopped saying so', async () => {
  await cms.presence.here(daniel, page.id, 'Daniel Reyes');
  clock.pass(PRESENCE_EDITOR_MS - 1);
  expect((await cms.presence.here(maya, page.id, 'Maya Ellison')).others).toHaveLength(1);
  clock.pass(1);
  expect((await cms.presence.here(maya, page.id, 'Maya Ellison')).others).toEqual([]);
});

it('shows an agent that just worked on the entry, for longer, and only an agent is marked that way', async () => {
  await cms.presence.touched(agent, page.id, 'Claude');
  await cms.presence.touched(daniel, page.id, 'Daniel Reyes');
  expect((await cms.presence.here(maya, page.id, 'Maya Ellison')).others).toEqual([{ id: 'token-1', kind: 'agent', name: 'Claude' }]);
  clock.pass(PRESENCE_AGENT_MS);
  expect((await cms.presence.here(maya, page.id, 'Maya Ellison')).others).toEqual([]);
  // An agent that asks is told, and is not counted as someone with the entry open.
  await cms.presence.here(agent, page.id, 'Claude');
  expect((await cms.presence.here(maya, page.id, 'Maya Ellison')).others).toEqual([]);
});

it('is for those who may read entries, about an entry that exists', async () => {
  const stranger: Actor = { kind: 'agent', id: 'token-2', role: 'author', permissions: [] };
  await expect(cms.presence.here(stranger, page.id, 'Nobody')).rejects.toBeInstanceOf(ForbiddenError);
  await expect(cms.presence.here(maya, 'no-such-entry', 'Maya Ellison')).rejects.toBeInstanceOf(NotFoundError);
  await cms.presence.touched(stranger, page.id, 'Nobody');
  expect((await cms.presence.here(maya, page.id, 'Maya Ellison')).others).toEqual([]);
});
