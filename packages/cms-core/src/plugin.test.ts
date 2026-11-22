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
    secret: 'a-test-secret-that-is-long-enough-0123456789',
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
      { name: 'ratings', label: { en: 'Ratings' }, description: { en: 'Stars for reviews.' }, version: '1.2.0', permissions: [], status: 'on', hasSettings: false, hasEditor: false, adds: { fieldTypes: ['rating'], checks: 0, pageHead: false, redirects: false, events: [], tasks: [] }, faults: 0 },
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

describe('what a plugin adds to the editor', () => {
  const seo = () =>
    definePlugin({
      name: 'seo',
      apiVersion: 1,
      label: { en: 'SEO' },
      editor: 'export default () => {};',
      setup(plugin) {
        plugin.fields.register(new RatingField());
        plugin.events.on('entry.published', () => undefined);
        plugin.checks.add('publish', () => []);
        plugin.checks.add('publish', () => []);
      },
    });
  const quiet = definePlugin({ name: 'quiet', apiVersion: 1, label: { en: 'Quiet' }, setup: () => undefined });

  it('lists the running plugins that have an editor file, for anyone signed in, and hands over the file', async () => {
    await cms.plugins.load([seo(), quiet]);
    expect(await cms.plugins.editors(editor)).toEqual([{ name: 'seo', label: { en: 'SEO' } }]);
    expect(await cms.plugins.editorFile('seo')).toBe('export default () => {};');
    expect(await cms.plugins.editorFile('quiet')).toBeNull();
    expect(await cms.plugins.editorFile('nothing')).toBeNull();
  });

  it('has no editor file to hand over while the plugin is switched off', async () => {
    await cms.plugins.load([seo()]);
    await cms.plugins.setEnabled(owner, 'seo', false);
    expect(await cms.plugins.editors(owner)).toEqual([]);
    expect(await cms.plugins.editorFile('seo')).toBeNull();
    await cms.plugins.setEnabled(owner, 'seo', true);
    expect(await cms.plugins.editorFile('seo')).toBe('export default () => {};');
  });

  it('says what a running plugin does on the server, and nothing for one that is off', async () => {
    await cms.plugins.load([seo(), quiet]);
    const [, first] = await cms.plugins.list(owner);
    expect(first).toMatchObject({ name: 'seo', hasEditor: true, adds: { fieldTypes: ['rating'], checks: 2, events: ['entry.published'] } });
    expect((await cms.plugins.list(owner))[0]).toMatchObject({ name: 'quiet', hasEditor: false, adds: { fieldTypes: [], checks: 0, events: [] } });
    expect(await cms.plugins.setEnabled(owner, 'seo', false)).toMatchObject({ adds: { fieldTypes: [], checks: 0, events: [] } });
    // Switched on again, it is counted once, not twice.
    expect(await cms.plugins.setEnabled(owner, 'seo', true)).toMatchObject({ adds: { fieldTypes: ['rating'], checks: 2, events: ['entry.published'] } });
  });
});

describe('what a plugin adds to the site\'s pages', () => {
  const page = { path: '/listings/oak-lane/', locale: 'en' };

  it('changes what a page says about itself, each rule seeing what the one before left', async () => {
    await cms.plugins.load([
      definePlugin({ name: 'first', apiVersion: 1, label: { en: 'First' }, setup: (plugin) => void plugin.pages.head((_page, head) => ({ title: `${head.title ?? ''} for sale`, noindex: true })) }),
      definePlugin({ name: 'second', apiVersion: 1, label: { en: 'Second' }, setup: (plugin) => void plugin.pages.head((_page, head) => ({ fullTitle: `${head.title ?? ''} | Lakeshore` })) }),
    ]);
    expect(await cms.pages.run(page, { title: 'Oak Lane', description: 'A house.' })).toEqual({ title: 'Oak Lane for sale', fullTitle: 'Oak Lane for sale | Lakeshore', description: 'A house.', noindex: true });
    expect((await cms.plugins.list(owner))[0]).toMatchObject({ adds: { pageHead: true } });
  });

  it('takes only plain text and a yes or no from a rule, so nothing it answers becomes markup or breaks a line', async () => {
    const answer = { title: ' Two\nlines ', description: 42, noindex: 'yes', fullTitle: '', script: '<script>' };
    await cms.plugins.load([definePlugin({ name: 'odd', apiVersion: 1, label: { en: 'Odd' }, setup: (plugin) => void plugin.pages.head(() => answer as never) })]);
    expect(await cms.pages.run(page, { description: 'Kept.' })).toEqual({ title: 'Two lines', description: 'Kept.' });
  });

  it('draws the page without a rule that fails, or one whose plugin is switched off', async () => {
    await cms.plugins.load([
      definePlugin({
        name: 'broken',
        apiVersion: 1,
        label: { en: 'Broken' },
        setup: (plugin) =>
          void plugin.pages.head(() => {
            throw new Error('No API key.');
          }),
      }),
      definePlugin({ name: 'titles', apiVersion: 1, label: { en: 'Titles' }, setup: (plugin) => void plugin.pages.head(() => ({ title: 'Changed' })) }),
    ]);
    expect(await cms.pages.run(page, { title: 'Oak Lane' })).toEqual({ title: 'Changed' });
    expect((await cms.plugins.list(owner))[0]).toMatchObject({ name: 'broken', faults: 1, lastFault: { where: 'page head', message: 'No API key.' } });
    await cms.plugins.setEnabled(owner, 'titles', false);
    expect(await cms.pages.run(page, { title: 'Oak Lane' })).toEqual({ title: 'Oak Lane' });
  });

  it('moves a visitor from an address with no page only while the plugin is on, and keeps a fault to itself', async () => {
    await cms.plugins.load([
      definePlugin({
        name: 'broken',
        apiVersion: 1,
        label: { en: 'Broken' },
        setup: (plugin) =>
          void plugin.pages.redirect(() => {
            throw new Error('No list.');
          }),
      }),
      definePlugin({ name: 'moves', apiVersion: 1, label: { en: 'Moves' }, setup: (plugin) => void plugin.pages.redirect((path) => (path === '/old/' ? { to: '/new/', permanent: true } : undefined)) }),
    ]);
    expect(await cms.pages.redirect('/old/')).toEqual({ to: '/new/', permanent: true });
    expect((await cms.plugins.list(owner))[0]).toMatchObject({ name: 'broken', faults: 1, lastFault: { where: 'redirect', message: 'No list.' } });
    expect((await cms.plugins.list(owner))[1]).toMatchObject({ name: 'moves', adds: { redirects: true, pageHead: false } });
    await cms.plugins.setEnabled(owner, 'moves', false);
    expect(await cms.pages.redirect('/old/')).toBeUndefined();
  });

  it('lists a plugin\'s own values under a prefix, and tells the site when pages changed', async () => {
    const heard: string[] = [];
    cms.events.on('pages.changed', ({ plugin }) => void heard.push(plugin));
    let context: PluginContext | undefined;
    await cms.plugins.load([definePlugin({ name: 'seo', apiVersion: 1, label: { en: 'SEO' }, setup: (plugin) => void (context = plugin) })]);
    await context?.store.set('written:e1', { title: 'One' });
    await context?.store.set('written:e2', { title: 'Two' });
    await context?.store.set('other', true);
    expect(await context?.store.list('written:')).toEqual({ 'written:e1': { title: 'One' }, 'written:e2': { title: 'Two' } });
    await context?.pages.changed();
    expect(heard).toEqual(['seo']);
  });
});

describe('secrets', () => {
  const mail = (use: (plugin: PluginContext) => void = () => undefined) =>
    definePlugin({ name: 'mail', apiVersion: 1, label: { en: 'Mail' }, secrets: [{ key: 'apiKey', label: { en: 'API key' } }], setup: use });

  it('keeps a secret sealed, hands it to the plugin and never back to the editor', async () => {
    let context: PluginContext | undefined;
    await cms.plugins.load([mail((plugin) => void (context = plugin))]);
    expect((await cms.plugins.list(owner))[0]).toMatchObject({ hasSettings: true });
    expect((await cms.plugins.settings(owner, 'mail')).secrets).toEqual([{ key: 'apiKey', label: { en: 'API key' }, isSet: false }]);
    expect(await context?.secrets.get('apiKey')).toBeUndefined();

    const saved = await cms.plugins.setSecret(owner, 'mail', 'apiKey', '  sk-12345  ');
    expect(saved.secrets).toEqual([{ key: 'apiKey', label: { en: 'API key' }, isSet: true }]);
    expect(JSON.stringify(saved)).not.toContain('sk-12345');
    expect(JSON.stringify(await store.list('mail', ''))).not.toContain('sk-12345');
    expect(await context?.secrets.get('apiKey')).toBe('sk-12345');

    await cms.plugins.setSecret(owner, 'mail', 'apiKey', null);
    expect(await context?.secrets.get('apiKey')).toBeUndefined();
    expect((await cms.plugins.settings(owner, 'mail')).secrets[0]?.isSet).toBe(false);
  });

  it('refuses an empty one, one the plugin did not name, and anyone but an owner', async () => {
    await cms.plugins.load([mail()]);
    await expect(cms.plugins.setSecret(owner, 'mail', 'apiKey', '   ')).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.plugins.setSecret(owner, 'mail', 'other', 'x')).rejects.toBeInstanceOf(NotFoundError);
    await expect(cms.plugins.setSecret(editor, 'mail', 'apiKey', 'x')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('saves none on a site with no secret to seal with', async () => {
    const bare = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
    await bare.plugins.load([mail()]);
    await expect(bare.plugins.setSecret(owner, 'mail', 'apiKey', 'sk-1')).rejects.toThrow(/VELOCITY_CMS_SECRET/);
  });
});

describe('work that is tried again', () => {
  /** A plugin whose work fails until `failures` runs out. */
  const sender = (failures: { left: number }, sent: unknown[], hold: { context?: PluginContext } = {}) =>
    definePlugin({
      name: 'sender',
      apiVersion: 1,
      label: { en: 'Sender' },
      setup(plugin) {
        hold.context = plugin;
        plugin.tasks.define('send', (payload) => {
          if (failures.left > 0) {
            failures.left -= 1;
            throw new Error('The other side answered 500.');
          }
          sent.push(payload);
        });
      },
    });

  it('does the work at once, and keeps what it carried no longer', async () => {
    const sent: unknown[] = [];
    const hold: { context?: PluginContext } = {};
    await cms.plugins.load([sender({ left: 0 }, sent, hold)]);
    expect((await cms.plugins.list(owner))[0]?.adds.tasks).toEqual(['send']);
    await hold.context?.tasks.add('send', { email: 'ana@example.com' }, { label: 'https://example.com/hook' });
    expect(sent).toEqual([{ email: 'ana@example.com' }]);
    expect(await cms.plugins.tasks(owner, 'sender')).toMatchObject([{ kind: 'send', label: 'https://example.com/hook', status: 'done', attempts: 1, canRetry: false }]);
    expect(JSON.stringify(await store.list('sender', ''))).not.toContain('ana@example.com');
    await expect(cms.plugins.tasks(editor, 'sender')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('tries failed work again later, and says why it failed meanwhile', async () => {
    const sent: unknown[] = [];
    const hold: { context?: PluginContext } = {};
    await cms.plugins.load([sender({ left: 2 }, sent, hold)]);
    await hold.context?.tasks.add('send', 'hello');
    expect(await cms.plugins.tasks(owner, 'sender')).toMatchObject([{ status: 'waiting', attempts: 1, lastError: 'The other side answered 500.' }]);
    // The fake clock moves a second each time it is read: the waits pass as work is looked for.
    for (let looks = 0; looks < 400 && sent.length === 0; looks += 1) await cms.plugins.work({ now: true });
    expect(sent).toEqual(['hello']);
    const [task] = await cms.plugins.tasks(owner, 'sender');
    expect(task).toMatchObject({ status: 'done', attempts: 3 });
    expect(task?.lastError).toBeUndefined();
  });

  it('gives up after the last try, notes the fault, and lets an owner have it tried again', async () => {
    const sent: unknown[] = [];
    const failures = { left: 1000 };
    const hold: { context?: PluginContext } = {};
    await cms.plugins.load([sender(failures, sent, hold)]);
    await hold.context?.tasks.add('send', 'hello');
    const [waiting] = await cms.plugins.tasks(owner, 'sender');
    if (!waiting) throw new Error('No task.');
    // Tried again by hand until it is given up on, as the waits would.
    let task = waiting;
    for (let tries = 0; task.status === 'waiting' && tries < 10; tries += 1) {
      await store.set('sender', `task:${task.id}`, { ...(await store.get('sender', `task:${task.id}`) as object), nextAt: '2000-01-01T00:00:00.000Z' });
      await cms.plugins.work({ now: true });
      task = (await cms.plugins.tasks(owner, 'sender'))[0] ?? task;
    }
    expect(task).toMatchObject({ status: 'failed', attempts: 6, canRetry: true });
    expect((await cms.plugins.list(owner))[0]).toMatchObject({ faults: 1, lastFault: { where: 'task send' } });

    failures.left = 0;
    await expect(cms.plugins.retryTask(editor, 'sender', task.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await cms.plugins.retryTask(owner, 'sender', task.id)).toMatchObject({ status: 'done', attempts: 1, canRetry: false });
    expect(sent).toEqual(['hello']);
    await expect(cms.plugins.retryTask(owner, 'sender', task.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses work of a kind the plugin never defined', async () => {
    const hold: { context?: PluginContext } = {};
    await cms.plugins.load([sender({ left: 0 }, [], hold)]);
    await expect(hold.context?.tasks.add('other', 1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('lets a plugin that declared it hear of contacts, and no other', async () => {
    await cms.plugins.load([
      definePlugin({ name: 'crm', apiVersion: 1, label: { en: 'CRM' }, permissions: ['contact:read'], setup: (plugin) => void plugin.events.on('contact.saved', () => undefined) }),
      definePlugin({ name: 'nosy', apiVersion: 1, label: { en: 'Nosy' }, setup: (plugin) => void plugin.events.on('contact.saved', () => undefined) }),
    ]);
    expect(await state()).toEqual([
      ['crm', 'on'],
      ['nosy', 'failed'],
    ]);
  });
});
