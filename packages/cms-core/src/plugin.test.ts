import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Actor } from './access.js';
import { createCms, type Cms } from './cms.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import { FieldType } from './field-type.js';
import { definePlugin, type PluginContext } from './plugin.js';
import { FakeClock, InMemoryEntryRepository, InMemoryPluginStore, InMemorySchemaRepository, SequentialIds, pluginStoreContract } from './testing/index.js';

pluginStoreContract('InMemoryPluginStore', async () => new InMemoryPluginStore());

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
let store: InMemoryPluginStore;

beforeEach(() => {
  logged = [];
  store = new InMemoryPluginStore();
  cms = createCms({
    pluginStore: store,
    entries: new InMemoryEntryRepository(),
    types: new InMemorySchemaRepository(),
    clock: new FakeClock(),
    ids: new SequentialIds(),
    onPluginFault: (plugin, error) => logged.push([plugin, error instanceof Error ? error.message : String(error)]),
  });
});

const state = async () => (await cms.plugins.list(owner)).map(({ name, status }) => [name, status]);

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
    expect(await cms.plugins.list(owner)).toEqual([
      { name: 'ratings', label: { en: 'Ratings' }, description: { en: 'Stars for reviews.' }, version: '1.2.0', permissions: [], status: 'on', hasSettings: false, faults: 0 },
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
    expect(await state()).toEqual([
      ['broken', 'failed'],
      ['fine', 'on'],
    ]);
    expect((await cms.plugins.list(owner))[0]?.problem).toBe('The plugin "broken" could not start, so it is switched off: No API key.');
    expect(logged).toEqual([['broken', 'No API key.']]);
    await cms.schema.create(owner, { key: 'notes', kind: 'collection', label: { en: 'Notes' }, fields: [] });
    expect(heard).toEqual(['fine']);
  });

  it('leaves out a plugin written for another version of the plugin API, and says which', async () => {
    await cms.plugins.load([{ name: 'future', apiVersion: 2, label: { en: 'Future' }, setup: () => undefined }]);
    expect((await cms.plugins.list(owner))[0]).toMatchObject({
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
    expect(await state()).toEqual([
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
    expect((await cms.plugins.list(owner))[0]).toMatchObject({ status: 'invalid', permissions: [] });
    expect((await cms.plugins.list(owner))[0]?.problem).toContain('asks for "user:manage", which no plugin may have');
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
    expect((await cms.plugins.list(owner))[0]).toMatchObject({ status: 'on', faults: 1, lastFault: { where: 'type.saved', message: 'The score service is down.' } });
    expect(logged).toEqual([['flaky', 'The score service is down.']]);
  });
});

describe('a check before publish', () => {
  const withCheck = (check: Parameters<PluginContext['checks']['add']>[1]) =>
    cms.plugins.load([definePlugin({ name: 'seo', apiVersion: 1, label: { en: 'SEO' }, setup: (plugin) => void plugin.checks.add('publish', check) })]);
  const draft = async () => {
    const notes = await cms.schema.create(owner, { key: 'notes', kind: 'collection', label: { en: 'Notes' }, fields: [{ key: 'summary', type: 'text', label: { en: 'Summary' } }] });
    return cms.content.create(owner, { typeId: notes.id, locale: 'en', slug: 'first', data: {} });
  };

  it('holds an entry back with what is wrong, by field key, and lets it out once fixed', async () => {
    await withCheck(({ entry }) => (entry.data['summary'] ? [] : [{ path: ['summary'], message: 'Write a summary before publishing.' }]));
    const entry = await draft();
    await expect(cms.content.publish(owner, entry.id)).rejects.toMatchObject({
      code: 'validation_failed',
      message: 'Write a summary before publishing.',
      issues: [{ path: ['summary'], message: 'Write a summary before publishing.' }],
    });
    expect((await cms.content.get(owner, entry.id)).status).toBe('draft');

    const type = await cms.schema.get(entry.typeId);
    const summary = type.fields[0]?.id ?? '';
    const fixed = await cms.content.update(owner, entry.id, { data: { [summary]: 'A short note.' }, expectedRevision: entry.revision });
    expect((await cms.content.publish(owner, fixed.id)).status).toBe('published');
  });

  it('does not hold a publish back when the check itself breaks', async () => {
    await withCheck(() => {
      throw new Error('The score service is down.');
    });
    const entry = await draft();
    expect((await cms.content.publish(owner, entry.id)).status).toBe('published');
    expect((await cms.plugins.list(owner))[0]).toMatchObject({ status: 'on', faults: 1, lastFault: { where: 'check before publish' } });
  });
});

describe('switching a plugin on and off', () => {
  const counter = (heard: string[], extra: object = {}) =>
    definePlugin({ name: 'counter', apiVersion: 1, label: { en: 'Counter' }, ...extra, setup: (plugin) => void plugin.events.on('type.saved', ({ type }) => void heard.push(type.key)) });
  const save = (key: string) => cms.schema.create(owner, { key, kind: 'collection', label: { en: key }, fields: [] });

  it('stops a plugin at once when an owner switches it off, and starts it again when switched on', async () => {
    const heard: string[] = [];
    await cms.plugins.load([counter(heard)]);
    await save('one');
    expect(await cms.plugins.setEnabled(owner, 'counter', false)).toMatchObject({ status: 'off' });
    await save('two');
    expect(await cms.plugins.setEnabled(owner, 'counter', true)).toMatchObject({ status: 'on' });
    await save('three');
    expect(heard).toEqual(['one', 'three']);
  });

  it('leaves a plugin that ships switched off until an owner activates it, and remembers the choice', async () => {
    const heard: string[] = [];
    await cms.plugins.load([counter(heard, { enabledByDefault: false })]);
    expect(await state()).toEqual([['counter', 'off']]);
    await save('one');
    expect(heard).toEqual([]);
    await cms.plugins.setEnabled(owner, 'counter', true);

    // The site starts again: the choice is in the database, not in the code.
    const again: string[] = [];
    const restarted = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), pluginStore: store });
    await restarted.plugins.load([counter(again, { enabledByDefault: false })]);
    expect((await restarted.plugins.list(owner))[0]?.status).toBe('on');
  });

  it('is for owners, and refuses a plugin that could never run', async () => {
    await cms.plugins.load([counter([]), { name: 'future', apiVersion: 2, label: { en: 'Future' }, setup: () => undefined }]);
    await expect(cms.plugins.setEnabled(editor, 'counter', false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.plugins.setEnabled(owner, 'future', true)).rejects.toBeInstanceOf(ConflictError);
    await expect(cms.plugins.setEnabled(owner, 'missing', true)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('a plugin\'s settings', () => {
  let plugin: PluginContext | undefined;
  const seo = () =>
    definePlugin({
      name: 'seo',
      apiVersion: 1,
      label: { en: 'SEO' },
      settings: [
        { key: 'titleSuffix', type: 'text', label: { en: 'Title ending' }, required: true },
        { key: 'maxLength', type: 'number', label: { en: 'Longest description' } },
      ],
      setup: (context) => void (plugin = context),
    });

  it('are described as fields, saved by an owner and read by the plugin by key', async () => {
    await cms.plugins.load([seo()]);
    expect((await cms.plugins.list(owner))[0]?.hasSettings).toBe(true);
    const { fields, values } = await cms.plugins.settings(owner, 'seo');
    expect(fields.map((field) => field.key)).toEqual(['titleSuffix', 'maxLength']);
    expect(values).toEqual({});

    const [suffix, length] = fields.map((field) => field.id) as [string, string];
    await cms.plugins.saveSettings(owner, 'seo', { [suffix]: ' | Lakeshore', [length]: 160 });
    expect(await plugin?.settings.get()).toEqual({ titleSuffix: ' | Lakeshore', maxLength: 160 });
    expect((await cms.plugins.settings(owner, 'seo')).values).toEqual({ [suffix]: ' | Lakeshore', [length]: 160 });
  });

  it('refuses settings that are not filled in correctly, naming the setting by key', async () => {
    await cms.plugins.load([seo()]);
    const { fields } = await cms.plugins.settings(owner, 'seo');
    const length = fields[1]?.id ?? '';
    const refused = await cms.plugins.saveSettings(owner, 'seo', { [length]: 'long' }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ValidationError);
    expect((refused as ValidationError).issues.map((issue) => issue.path)).toEqual([['titleSuffix'], ['maxLength']]);
    expect((refused as ValidationError).issues[0]?.message).toBe('Fill this in.');
    await expect(cms.plugins.settings(editor, 'seo')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('keeps a setting\'s id, and so its value, when the site starts again', async () => {
    await cms.plugins.load([seo()]);
    const before = (await cms.plugins.settings(owner, 'seo')).fields.map((field) => field.id);
    const restarted = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), pluginStore: store });
    await restarted.plugins.load([seo()]);
    expect((await restarted.plugins.settings(owner, 'seo')).fields.map((field) => field.id)).toEqual(before);
  });
});

describe('a plugin\'s own addresses and store', () => {
  const notes = () =>
    definePlugin({
      name: 'notes',
      apiVersion: 1,
      label: { en: 'Notes' },
      setup(plugin) {
        plugin.routes.add('GET', '/items/:id', async ({ params, query }) => ({ id: params['id'], shout: query['shout'] === 'yes', value: await plugin.store.get(params['id'] ?? '') }));
        plugin.routes.add('PUT', '/items/:id', async ({ params, body }) => plugin.store.set(params['id'] ?? '', body), { requires: 'entry:publish' });
        plugin.routes.add('GET', '/broken', () => {
          throw new Error('Out of memory.');
        });
        plugin.routes.add('GET', '/refuses', () => {
          throw new ConflictError('Nothing to report yet.');
        });
      },
    });
  const author: Actor = { kind: 'user', id: 'priya', role: 'author' };
  const none = { query: {}, body: undefined };

  it('answers as the plugin wrote it, with what the address and the request carry', async () => {
    await cms.plugins.load([notes()]);
    await cms.plugins.call(editor, 'notes', 'PUT', '/items/a', { query: {}, body: { text: 'hello' } });
    expect(await cms.plugins.call(author, 'notes', 'GET', '/items/a', { query: { shout: 'yes' }, body: undefined })).toEqual({ id: 'a', shout: true, value: { text: 'hello' } });
    // What a plugin keeps is its own: the host's notes about it are out of its reach.
    expect(await store.get('notes', 'data:a')).toEqual({ text: 'hello' });
  });

  it('asks the person for what the address requires, and has nothing at an address nobody added', async () => {
    await cms.plugins.load([notes()]);
    await expect(cms.plugins.call(author, 'notes', 'PUT', '/items/a', none)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.plugins.call(editor, 'notes', 'GET', '/nowhere', none)).rejects.toBeInstanceOf(NotFoundError);
    await expect(cms.plugins.call(editor, 'missing', 'GET', '/items/a', none)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('keeps a refusal\'s own words, and says nothing of what broke inside', async () => {
    await cms.plugins.load([notes()]);
    await expect(cms.plugins.call(editor, 'notes', 'GET', '/refuses', none)).rejects.toThrow('Nothing to report yet.');
    await expect(cms.plugins.call(editor, 'notes', 'GET', '/broken', none)).rejects.toThrow('The plugin "notes" could not answer. An owner can see what went wrong under Plugins.');
    expect((await cms.plugins.list(owner))[0]).toMatchObject({ faults: 1, lastFault: { where: 'GET /broken', message: 'Out of memory.' } });
  });

  it('has no addresses while it is switched off', async () => {
    await cms.plugins.load([notes()]);
    await cms.plugins.setEnabled(owner, 'notes', false);
    await expect(cms.plugins.call(editor, 'notes', 'GET', '/items/a', none)).rejects.toBeInstanceOf(NotFoundError);
  });
});

it('shows the plugins to owners only', async () => {
  expect(await cms.plugins.list(owner)).toEqual([]);
  await expect(cms.plugins.list(editor)).rejects.toBeInstanceOf(ForbiddenError);
});
