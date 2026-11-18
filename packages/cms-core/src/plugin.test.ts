import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Actor } from './access.js';
import { createCms, type Cms } from './cms.js';
import { ForbiddenError } from './errors.js';
import { FieldType } from './field-type.js';
import { definePlugin, type PluginContext } from './plugin.js';
import { FakeClock, InMemoryEntryRepository, InMemorySchemaRepository, SequentialIds } from './testing/index.js';

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const editor: Actor = { kind: 'user', id: 'daniel', role: 'editor' };

class RatingField extends FieldType<number> {
  readonly type = 'rating';
  readonly editor = 'rating-input';
  readonly options = z.object({});
  schema() {
    return z.number().int().min(1).max(5);
  }
}

let cms: Cms;
let logged: [string, string][];

beforeEach(() => {
  logged = [];
  cms = createCms({
    entries: new InMemoryEntryRepository(),
    types: new InMemorySchemaRepository(),
    clock: new FakeClock(),
    ids: new SequentialIds(),
    onPluginFault: (plugin, error) => logged.push([plugin, error instanceof Error ? error.message : String(error)]),
  });
});

const state = () => cms.plugins.list(owner).map(({ name, status }) => [name, status]);

describe('starting plugins', () => {
  it('runs each plugin once, and a field type it adds works like a built-in', async () => {
    await cms.plugins.load([
      definePlugin({
        name: 'ratings',
        apiVersion: 1,
        label: { en: 'Ratings' },
        description: { en: 'Stars for reviews.' },
        version: '1.2.0',
        setup: (plugin) => plugin.fields.register(new RatingField()),
      }),
    ]);
    expect(cms.plugins.list(owner)).toEqual([
      { name: 'ratings', label: { en: 'Ratings' }, description: { en: 'Stars for reviews.' }, version: '1.2.0', permissions: [], status: 'on', faults: 0 },
    ]);
    const reviews = await cms.schema.create(owner, { key: 'reviews', kind: 'collection', label: { en: 'Reviews' }, fields: [{ key: 'stars', type: 'rating', label: { en: 'Stars' } }] });
    expect(reviews.fields[0]?.type).toBe('rating');
  });

  it('switches off a plugin whose setup fails, undoes what it listened to, and starts the rest', async () => {
    const heard: string[] = [];
    await cms.plugins.load([
      definePlugin({
        name: 'broken',
        apiVersion: 1,
        label: { en: 'Broken' },
        setup(plugin) {
          plugin.events.on('type.saved', () => void heard.push('broken'));
          throw new Error('No API key.');
        },
      }),
      definePlugin({ name: 'fine', apiVersion: 1, label: { en: 'Fine' }, setup: (plugin) => void plugin.events.on('type.saved', () => void heard.push('fine')) }),
    ]);
    expect(state()).toEqual([
      ['broken', 'failed'],
      ['fine', 'on'],
    ]);
    expect(cms.plugins.list(owner)[0]?.problem).toBe('The plugin "broken" could not start, so it is switched off: No API key.');
    expect(logged).toEqual([['broken', 'No API key.']]);
    await cms.schema.create(owner, { key: 'notes', kind: 'collection', label: { en: 'Notes' }, fields: [] });
    expect(heard).toEqual(['fine']);
  });

  it('leaves out a plugin written for another version of the plugin API, and says which', async () => {
    await cms.plugins.load([{ name: 'future', apiVersion: 2, label: { en: 'Future' }, setup: () => undefined }]);
    expect(cms.plugins.list(owner)[0]).toMatchObject({
      status: 'unsupported',
      problem: 'The plugin "future" was written for plugin API version 2, and this CMS offers version 1. Install a version of the plugin made for it.',
    });
  });

  it('gives a row to whatever is not a plugin, so the owner sees it was left out', async () => {
    await cms.plugins.load([
      undefined,
      { name: 'Bad Name', apiVersion: 1, label: { en: 'Bad' }, setup: () => undefined },
      { name: 'twice', apiVersion: 1, label: { en: 'Twice' }, setup: () => undefined },
      { name: 'twice', apiVersion: 1, label: { en: 'Twice' }, setup: () => undefined },
      { name: 'no-setup', apiVersion: 1, label: { en: 'No setup' } },
    ]);
    expect(state()).toEqual([
      ['no-setup', 'invalid'],
      ['plugin-1', 'invalid'],
      ['plugin-2', 'invalid'],
      ['twice', 'on'],
      ['twice-4', 'invalid'],
    ]);
  });
});

describe('what a plugin may do', () => {
  it('acts as itself with exactly the permissions it declared', async () => {
    let plugin: PluginContext | undefined;
    await cms.plugins.load([definePlugin({ name: 'importer', apiVersion: 1, label: { en: 'Importer' }, permissions: ['entry:read', 'entry:write'], setup: (context) => void (plugin = context) })]);
    const notes = await cms.schema.create(owner, { key: 'notes', kind: 'collection', label: { en: 'Notes' }, fields: [] });
    if (!plugin) throw new Error('The plugin did not start.');

    const entry = await plugin.content.create(plugin.actor, { typeId: notes.id, locale: 'en', slug: 'first', data: {} });
    expect(entry.slug).toBe('first');
    // Publishing and changing content types were not asked for.
    await expect(plugin.content.publish(plugin.actor, entry.id, entry.revision)).rejects.toThrow('The plugin "importer" was not given "entry:publish".');
    await expect(plugin.schema.create(plugin.actor, { key: 'more', kind: 'collection', label: { en: 'More' }, fields: [] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a plugin that asks to manage people or other plugins', async () => {
    await cms.plugins.load([{ name: 'greedy', apiVersion: 1, label: { en: 'Greedy' }, permissions: ['user:manage'], setup: () => undefined }]);
    expect(cms.plugins.list(owner)[0]).toMatchObject({ status: 'invalid', permissions: [] });
    expect(cms.plugins.list(owner)[0]?.problem).toContain('asks for "user:manage", which no plugin may have');
  });
});

describe('a running plugin that fails', () => {
  it('is caught and counted, and the change it heard of stands', async () => {
    await cms.plugins.load([
      definePlugin({
        name: 'flaky',
        apiVersion: 1,
        label: { en: 'Flaky' },
        setup: (plugin) =>
          void plugin.events.on('type.saved', () => {
            throw new Error('The score service is down.');
          }),
      }),
    ]);
    const notes = await cms.schema.create(owner, { key: 'notes', kind: 'collection', label: { en: 'Notes' }, fields: [] });
    expect(notes.key).toBe('notes');
    expect(cms.plugins.list(owner)[0]).toMatchObject({ status: 'on', faults: 1, lastFault: { where: 'type.saved', message: 'The score service is down.' } });
    expect(logged).toEqual([['flaky', 'The score service is down.']]);
  });
});

it('shows the plugins to owners only', async () => {
  expect(cms.plugins.list(owner)).toEqual([]);
  expect(() => cms.plugins.list(editor)).toThrow(ForbiddenError);
});
