import { NotFoundError, createCms, definePlugin, type Actor, type Cms, type ContentTypeDef, type FieldDef, type Entry } from '@velocity/cms-core';
import {
  FakeClock,
  InMemoryEntryRepository,
  InMemoryImageLibrary,
  InMemoryMediaRepository,
  InMemoryMediaStore,
  InMemorySchemaRepository,
  SequentialIds,
  tinyPng,
} from '@velocity/cms-core/in-memory';
import { beforeEach, describe, expect, it } from 'vitest';
import { CmsApi } from './api.js';
import type { People, Person } from './people.js';
import { FixedAuthenticator } from './testing/index.js';

const SITE = 'https://site.test';
const dana = { id: 'u1', email: 'dana@example.com', name: 'Dana' };
const as = (role: Actor['role']) => ({ user: dana, actor: { kind: 'user' as const, id: dana.id, role } });

let cms: Cms;
let api: CmsApi;
let authenticator: FixedAuthenticator;
let listings: ContentTypeDef;
let faults: unknown[];

const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  api.handle(
    new Request(`${SITE}/api/cms${path}`, {
      method,
      headers: { ...(method !== 'GET' && { 'content-type': 'application/json', origin: SITE }), ...headers },
      ...(body !== undefined && { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
  );
/** Sends a request and returns its status with its JSON. */
const call = async (method: string, path: string, body?: unknown, headers?: Record<string, string>) => {
  const response = await send(method, path, body, headers);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> & { error?: { code: string; message: string; issues?: unknown } } };
};
const fieldId = (key: string) => listings.fields.find((field) => field.key === key)?.id ?? '';

beforeEach(async () => {
  cms = createCms({
    entries: new InMemoryEntryRepository(),
    types: new InMemorySchemaRepository(),
    clock: new FakeClock(),
    ids: new SequentialIds(),
    previews: { secret: 'p'.repeat(32) },
    media: { storage: { files: new InMemoryMediaRepository(), store: new InMemoryMediaStore() }, maxBytes: 2000 },
  });
  cms.media.include(new InMemoryImageLibrary([{ name: 'porch', url: '/_astro/porch.jpg' }]));
  listings = await cms.schema.create(as('owner').actor, {
    key: 'listings',
    kind: 'collection',
    label: { en: 'Listings' },
    urlPattern: '/listings/[slug]',
    fields: [
      { key: 'title', type: 'text', label: { en: 'Title' }, required: true },
      { key: 'price', type: 'number', label: { en: 'Price' } },
    ],
  });
  authenticator = new FixedAuthenticator(as('editor'));
  faults = [];
  api = new CmsApi({ cms, authenticator, onFault: (error) => faults.push(error) });
});

describe('who is asking', () => {
  it('says who is signed in, and null when nobody is', async () => {
    expect((await call('GET', '/session')).body).toEqual({ user: { ...dana, role: 'editor' } });
    authenticator.session = null;
    expect(await call('GET', '/session')).toEqual({ status: 200, body: { user: null } });
  });

  it('refuses everything else until someone signs in', async () => {
    authenticator.session = null;
    for (const [method, path] of [['GET', '/content-types'], ['GET', '/field-types'], ['GET', '/entries?type=listings'], ['GET', '/entries/x'], ['POST', '/entries'], ['PATCH', '/entries/x'], ['POST', '/entries/x/publish'], ['POST', '/entries/x/unpublish'], ['DELETE', '/entries/x'], ['POST', '/entries/x/restore'], ['GET', '/trash'], ['DELETE', '/trash/x'], ['POST', '/entries/x/preview']] as const) {
      const { status, body } = await call(method, path, method === 'GET' ? undefined : {});
      expect([method, path, status, body.error?.code]).toEqual([method, path, 401, 'unauthenticated']);
    }
  });

  it('applies the role of whoever asks: an author may save but not publish', async () => {
    authenticator.session = as('author');
    const created = await call('POST', '/entries', { type: 'listings', slug: 'lake-house', data: { [fieldId('title')]: 'Lake house' } });
    expect(created.status).toBe(201);
    const refused = await call('POST', `/entries/${created.body['id'] as string}/publish`, { expectedRevision: 1 });
    expect([refused.status, refused.body.error?.code]).toEqual([403, 'forbidden']);
  });
});

describe('reading', () => {
  it('lists content types and the control each field type is edited with', async () => {
    const types = await call('GET', '/content-types');
    expect((types.body['items'] as ContentTypeDef[]).map((type) => type.key)).toEqual(['listings']);
    const fieldTypes = await call('GET', '/field-types');
    expect(fieldTypes.body['items']).toContainEqual({ type: 'text', editor: 'text-input', takesSubmissions: true });
  });

  it('lists a type\'s entries, most recently saved first, a page at a time', async () => {
    const actor = as('editor').actor;
    const make = (slug: string) => cms.content.create(actor, { typeId: listings.id, locale: 'en', slug, data: {} });
    const [a, b, c] = [await make('a'), await make('b'), await make('c')];
    await cms.content.update(actor, a.id, { data: { [fieldId('price')]: 1 }, expectedRevision: 1 });

    const all = await call('GET', '/entries?type=listings');
    expect((all.body['items'] as Entry[]).map((entry) => entry.slug)).toEqual(['a', 'c', 'b']);
    expect(all.body['total']).toBe(3);
    const page = await call('GET', '/entries?type=listings&limit=1&offset=1');
    expect((page.body['items'] as Entry[]).map((entry) => entry.id)).toEqual([c.id]);
    expect((await call('GET', '/entries?type=listings&locale=es')).body['total']).toBe(0);
    expect(b.slug).toBe('b');
  });

  it('refuses a list request it cannot make sense of, and says why', async () => {
    expect((await call('GET', '/entries')).status).toBe(400);
    const tooMany = await call('GET', '/entries?type=listings&limit=5000');
    expect([tooMany.status, tooMany.body.error?.code]).toEqual([400, 'bad_request']);
    expect(tooMany.body.error?.message).toContain('"limit"');
    expect((await call('GET', '/entries?type=unicorns')).status).toBe(404);
  });

  it('gives one entry, or says it does not exist', async () => {
    const created = await call('POST', '/entries', { type: 'listings', slug: 'lake-house', data: {} });
    const id = created.body['id'] as string;
    expect((await call('GET', `/entries/${id}`)).body).toMatchObject({ id, slug: 'lake-house', locale: 'en', status: 'draft', revision: 1 });
    const missing = await call('GET', '/entries/nope');
    expect([missing.status, missing.body.error?.code]).toEqual([404, 'not_found']);
  });
});

describe('writing', () => {
  const create = async (data: Record<string, unknown> = {}) =>
    (await call('POST', '/entries', { type: 'listings', slug: 'lake-house', data })).body as unknown as Entry;

  it('saves, publishes and unpublishes, each as its own step', async () => {
    const draft = await create({ [fieldId('title')]: 'Lake house' });
    const saved = await call('PATCH', `/entries/${draft.id}`, { slug: 'lake-house', data: { [fieldId('title')]: 'Lake house, renovated' }, expectedRevision: 1 });
    expect(saved.body).toMatchObject({ revision: 2, status: 'draft' });
    const published = await call('POST', `/entries/${draft.id}/publish`, { expectedRevision: 2 });
    expect(published.body).toMatchObject({ status: 'published', published: { revision: 3, data: { [fieldId('title')]: 'Lake house, renovated' } } });
    const unpublished = await call('POST', `/entries/${draft.id}/unpublish`);
    expect(unpublished.body).toMatchObject({ status: 'draft' });
    expect(unpublished.body).not.toHaveProperty('published');
  });

  it('moves an entry to the trash, lists the trash, restores from it and deletes for good', async () => {
    const draft = await create({ [fieldId('title')]: 'Lake house' });
    const trashed = await call('DELETE', `/entries/${draft.id}`);
    expect(trashed.status).toBe(200);
    expect(trashed.body).toMatchObject({ id: draft.id, status: 'draft' });
    expect(trashed.body).toHaveProperty('deletedAt');
    expect((await call('GET', '/entries?type=listings')).body).toMatchObject({ total: 0 });
    expect((await call('GET', '/trash')).body).toMatchObject({ total: 1, items: [{ id: draft.id }] });
    expect((await call('GET', '/trash?limit=0')).status).toBe(400);

    const restored = await call('POST', `/entries/${draft.id}/restore`);
    expect(restored.body).not.toHaveProperty('deletedAt');
    expect((await call('GET', '/trash')).body).toMatchObject({ total: 0 });

    // Only what is in the trash can be deleted for good.
    expect((await call('DELETE', `/trash/${draft.id}`)).status).toBe(409);
    await call('DELETE', `/entries/${draft.id}`);
    expect((await call('DELETE', `/trash/${draft.id}`)).status).toBe(200);
    expect((await call('GET', `/entries/${draft.id}`)).status).toBe(404);
  });

  it('gives a link to a draft\'s page, which an author may ask for too', async () => {
    authenticator.session = as('author');
    const draft = await create({ [fieldId('title')]: 'Lake house' });
    const link = await call('POST', `/entries/${draft.id}/preview`, {});
    expect(link.status).toBe(200);
    expect(link.body['path']).toMatch(/^\/listings\/lake-house\/\?preview=\d+\.[0-9a-f]{64}$/);
    expect((await call('POST', '/entries/missing/preview', {})).status).toBe(404);
  });

  it('reports each field that stops a publish, by key', async () => {
    const draft = await create();
    const refused = await call('POST', `/entries/${draft.id}/publish`, { expectedRevision: 1 });
    expect(refused.status).toBe(422);
    expect(refused.body.error).toMatchObject({ code: 'validation_failed', issues: [{ path: ['title'], message: 'Fill this in before publishing.' }] });
  });

  it('refuses a save made from a version someone else has since replaced', async () => {
    const draft = await create();
    await call('PATCH', `/entries/${draft.id}`, { slug: 'lake-house', data: {}, expectedRevision: 1 });
    const stale = await call('PATCH', `/entries/${draft.id}`, { slug: 'lake-house', data: {}, expectedRevision: 1 });
    expect([stale.status, stale.body.error?.code]).toEqual([409, 'conflict']);
  });

  it('refuses a slug that is taken or could not be part of an address', async () => {
    await create();
    expect((await call('POST', '/entries', { type: 'listings', slug: 'lake-house', data: {} })).status).toBe(409);
    const bad = await call('POST', '/entries', { type: 'listings', slug: '../admin', data: {} });
    expect([bad.status, bad.body.error?.code]).toEqual([422, 'validation_failed']);
  });

  it('refuses a body that is not what the address takes', async () => {
    const draft = await create();
    const cases: [string, string, unknown][] = [
      ['POST', '/entries', '{not json'],
      ['POST', '/entries', { type: 'listings', slug: 'x', data: {}, status: 'published' }],
      ['POST', '/entries', { type: 'listings', slug: 'x', data: [] }],
      ['PATCH', `/entries/${draft.id}`, { slug: 'x', data: {} }],
      ['POST', `/entries/${draft.id}/publish`, {}],
    ];
    for (const [method, path, body] of cases) {
      const { status, body: answer } = await call(method, path, body);
      expect([path, status, answer.error?.code]).toEqual([path, 400, 'bad_request']);
    }
  });

  it('refuses a body larger than it accepts', async () => {
    api = new CmsApi({ cms, authenticator, maxBodyBytes: 100 });
    const big = await call('POST', '/entries', { type: 'listings', slug: 'x', data: { [fieldId('title')]: 'é'.repeat(80) } });
    expect([big.status, big.body.error?.code]).toEqual([413, 'too_large']);
  });
});

describe('requests from other sites', () => {
  const body = { type: 'listings', slug: 'lake-house', data: {} };

  it('refuses a change that another site\'s page tries to make', async () => {
    const forged = await call('POST', '/entries', body, { origin: 'https://evil.test' });
    expect([forged.status, forged.body.error?.code]).toEqual([403, 'forbidden']);
    expect((await call('GET', '/entries?type=listings')).body['total']).toBe(0);
  });

  it('refuses a change sent as a form, which a page can post across sites without asking', async () => {
    const form = await call('POST', '/entries', JSON.stringify(body), { 'content-type': 'text/plain' });
    expect([form.status, form.body.error?.code]).toEqual([415, 'unsupported_media_type']);
  });

  it('accepts an origin the site has said it trusts', async () => {
    api = new CmsApi({ cms, authenticator, trustedOrigins: ['https://editor.test'] });
    expect((await call('POST', '/entries', body, { origin: 'https://editor.test' })).status).toBe(201);
  });
});

describe('building content types', () => {
  beforeEach(() => void (authenticator.session = as('owner')));

  it('starts a type, changes it, and adds, changes, orders, removes and restores its fields', async () => {
    const created = await call('POST', '/content-types', { key: 'news', kind: 'collection', label: { en: 'News' }, urlPattern: '/news/[slug]' });
    expect(created.status).toBe(201);
    const id = created.body['id'] as string;
    expect((await call('PATCH', `/content-types/${id}`, { label: { en: 'Stories' }, urlPattern: null })).body).toEqual({ id, key: 'news', kind: 'collection', label: { en: 'Stories' }, fields: [] });

    const withTitle = await call('POST', `/content-types/${id}/fields`, { key: 'title', type: 'text', label: { en: 'Title' }, required: true });
    expect(withTitle.status).toBe(201);
    const withBody = await call('POST', `/content-types/${id}/fields`, { key: 'body', type: 'richtext', label: { en: 'Body' } });
    const [title, body] = (withBody.body['fields'] as FieldDef[]).map((field) => field.id) as [string, string];

    const changed = await call('PATCH', `/content-types/${id}/fields/${title}`, { key: 'headline', options: { maxLength: 90 } });
    expect((changed.body['fields'] as FieldDef[])[0]).toMatchObject({ id: title, key: 'headline', required: true, options: { maxLength: 90 } });
    const ordered = await call('PUT', `/content-types/${id}/fields`, { order: [body, title] });
    expect((ordered.body['fields'] as FieldDef[]).map((field) => field.key)).toEqual(['body', 'headline']);

    const removed = await call('DELETE', `/content-types/${id}/fields/${body}`, {});
    expect((removed.body['fields'] as FieldDef[])[0]?.deletedAt).toBeTypeOf('string');
    const restored = await call('POST', `/content-types/${id}/fields/${body}/restore`, {});
    expect((restored.body['fields'] as FieldDef[])[0]).not.toHaveProperty('deletedAt');
  });

  it('keeps the services\' refusals: only owners, known field types, free keys', async () => {
    const taken = await call('POST', '/content-types', { key: 'listings', kind: 'collection', label: { en: 'Again' } });
    expect([taken.status, taken.body.error?.code]).toEqual([409, 'conflict']);
    const unknown = await call('POST', `/content-types/${listings.id}/fields`, { key: 'mood', type: 'emoji', label: { en: 'Mood' } });
    expect(unknown.status).toBeGreaterThanOrEqual(400);
    expect(unknown.body.error?.message).toContain('emoji');
    const shape = await call('POST', '/content-types', { key: 'news', kind: 'folder', label: { en: 'News' } });
    expect([shape.status, shape.body.error?.code]).toEqual([400, 'bad_request']);

    authenticator.session = as('editor');
    for (const [method, path, body] of [
      ['POST', '/content-types', { key: 'news', kind: 'collection', label: { en: 'News' } }],
      ['PATCH', `/content-types/${listings.id}`, { label: { en: 'Homes' } }],
      ['POST', `/content-types/${listings.id}/fields`, { key: 'beds', type: 'number', label: { en: 'Beds' } }],
      ['PUT', `/content-types/${listings.id}/fields`, { order: [] }],
      ['PUT', `/content-types/${listings.id}/sections`, { sections: [] }],
      ['PATCH', `/content-types/${listings.id}/fields/${fieldId('title')}`, { required: false }],
      ['DELETE', `/content-types/${listings.id}/fields/${fieldId('title')}`, {}],
      ['POST', `/content-types/${listings.id}/fields/${fieldId('title')}/restore`, {}],
    ] as const) {
      const refused = await call(method, path, body);
      expect([method, path, refused.status, refused.body.error?.code]).toEqual([method, path, 403, 'forbidden']);
    }
  });
});

describe('the edges', () => {
  it('answers 404 outside its routes and 405 for a method an address does not take', async () => {
    expect((await call('GET', '/nothing-here')).status).toBe(404);
    expect((await api.handle(new Request(`${SITE}/elsewhere`))).status).toBe(404);
    const response = await send('PUT', '/entries/x');
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, PATCH, DELETE');
  });

  it('never lets an answer be cached', async () => {
    for (const response of [await send('GET', '/session'), await send('GET', '/entries/nope'), await send('GET', '/nothing-here')]) {
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('mounts wherever the site puts it', async () => {
    api = new CmsApi({ cms, authenticator, basePath: 'admin/api/' });
    expect((await api.handle(new Request(`${SITE}/admin/api/session`))).status).toBe(200);
    expect((await api.handle(new Request(`${SITE}/admin/apix/session`))).status).toBe(404);
  });

  it('says nothing about a fault inside, and reports it to the host', async () => {
    authenticator.authenticate = async () => {
      throw new Error('database password is hunter2');
    };
    const { status, body } = await call('GET', '/content-types');
    expect(status).toBe(500);
    expect(body.error).toEqual({ code: 'internal', message: 'Something went wrong on the server. Try again in a moment.' });
    expect(faults).toHaveLength(1);
  });
});

describe('images', () => {
  const upload = (bytes: Uint8Array, headers: Record<string, string> = {}, name = 'Kitchen.png') =>
    api.handle(
      new Request(`${SITE}/api/cms/images?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'content-type': 'image/png', origin: SITE, ...headers },
        body: bytes,
      }),
    );

  it("lists the site's images and says how large an upload may be", async () => {
    expect((await call('GET', '/images')).body).toEqual({ items: [{ name: 'porch', url: '/_astro/porch.jpg' }], upload: { maxBytes: 2000 } });
  });

  it('takes an image as the body of the request', async () => {
    const response = await upload(tinyPng(800, 600));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ name: 'kitchen', url: '/media/kitchen.png', width: 800, height: 600 });
    expect(((await call('GET', '/images')).body['items'] as unknown[]).length).toBe(2);
  });

  it('refuses an upload from another site, one that is not sent as an image, and one nobody is signed in for', async () => {
    expect((await upload(tinyPng(), { origin: 'https://evil.test' })).status).toBe(403);
    // A form on another site can send text or a form without asking first, so neither is taken.
    expect((await upload(tinyPng(), { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await upload(tinyPng(), { 'content-type': 'multipart/form-data; boundary=x' })).status).toBe(415);
    authenticator.session = null;
    expect((await upload(tinyPng())).status).toBe(401);
    expect(await cms.media.uploads(as('owner').actor)).toEqual([]);
  });

  it('refuses a file that is too heavy before reading all of it, and one that is not an image', async () => {
    const heavy = await upload(new Uint8Array(2001));
    expect(heavy.status).toBe(413);
    expect(((await heavy.json()) as { error: { message: string } }).error.message).toContain('an upload can be');

    const fake = await upload(new TextEncoder().encode('<script>alert(1)</script>'));
    expect(fake.status).toBe(422);
    expect(((await fake.json()) as { error: { code: string; issues: unknown } }).error).toMatchObject({
      code: 'validation_failed',
      issues: [{ path: ['file'] }],
    });
    expect(faults).toEqual([]);
  });

  it('still takes only JSON everywhere else', async () => {
    const response = await send('POST', '/entries', 'x', { 'content-type': 'image/png' });
    expect(response.status).toBe(415);
  });
});

describe('people', () => {
  /** Stands in for sign-in: it keeps a list, and lets only owners touch it. */
  const peopleOf = (list: Person[]): People => {
    const check = (who: Actor) => cms.access.require(who, 'user:manage');
    return {
      listUsers: async (who) => (check(who), [...list]),
      invite: async (who, person) => {
        check(who);
        const added = { id: `p${list.length + 1}`, ...person };
        list.push(added);
        return added;
      },
      changeRole: async (who, id, role) => {
        check(who);
        const index = list.findIndex((person) => person.id === id);
        const person = list[index];
        if (!person) throw new NotFoundError('Person', id);
        return (list[index] = { ...person, role });
      },
      remove: async (who, id) => {
        check(who);
        list.splice(list.findIndex((person) => person.id === id), 1);
      },
    };
  };

  beforeEach(() => {
    api = new CmsApi({ cms, authenticator, people: peopleOf([{ id: 'p1', email: 'dana@example.com', name: 'Dana', role: 'owner' }]) });
    authenticator.session = as('owner');
  });

  it('lists, invites, changes a role and removes, each through the people service', async () => {
    const invited = await call('POST', '/people', { email: 'ben@example.com', name: 'Ben', role: 'author' });
    expect([invited.status, invited.body]).toEqual([201, { id: 'p2', email: 'ben@example.com', name: 'Ben', role: 'author' }]);
    expect((await call('PATCH', '/people/p2', { role: 'editor' })).body).toMatchObject({ id: 'p2', role: 'editor' });
    expect(((await call('GET', '/people')).body['items'] as Person[]).map((person) => person.role)).toEqual(['owner', 'editor']);
    expect((await call('DELETE', '/people/p2', {})).status).toBe(200);
    expect((await call('GET', '/people')).body['items']).toHaveLength(1);
    expect((await call('PATCH', '/people/nobody', { role: 'editor' })).status).toBe(404);
  });

  it('refuses anyone the people service refuses, and a request of the wrong shape', async () => {
    authenticator.session = as('editor');
    expect((await call('GET', '/people')).status).toBe(403);
    expect((await call('POST', '/people', { email: 'x@example.com', name: 'X', role: 'owner' })).status).toBe(403);
    authenticator.session = as('owner');
    expect((await call('POST', '/people', { email: 'x@example.com', name: 'X', role: 'owner', isAdmin: true })).status).toBe(400);
    authenticator.session = null;
    expect((await call('GET', '/people')).status).toBe(401);
  });

  it('has nothing under /people on a site that brings no people service', async () => {
    api = new CmsApi({ cms, authenticator });
    expect((await call('GET', '/people')).status).toBe(404);
  });
});

describe('plugins', () => {
  const seo = definePlugin({
    name: 'seo',
    apiVersion: 1,
    label: { en: 'SEO' },
    settings: [{ key: 'titleSuffix', type: 'text', label: { en: 'Title ending' }, required: true }],
    setup(plugin) {
      plugin.routes.add('GET', '/report/:slug', async ({ params, query }) => ({ slug: params['slug'], suffix: (await plugin.settings.get())['titleSuffix'], full: query['full'] === 'yes' }));
      plugin.routes.add('POST', '/notes', ({ body }) => plugin.store.set('note', body), { requires: 'entry:publish' });
      plugin.routes.add('GET', '/broken', () => {
        throw new Error('The database password is hunter2.');
      });
    },
  });

  beforeEach(async () => {
    await cms.plugins.load([seo]);
    authenticator.session = as('owner');
  });

  it('lists them, switches one off and on, and saves its settings, for owners', async () => {
    expect((await call('GET', '/plugins')).body['items']).toMatchObject([{ name: 'seo', status: 'on', hasSettings: true }]);
    expect((await call('PATCH', '/plugins/seo', { enabled: false })).body).toMatchObject({ name: 'seo', status: 'off' });
    expect((await call('PATCH', '/plugins/seo', { enabled: true })).body).toMatchObject({ status: 'on' });

    const settings = (await call('GET', '/plugin-settings/seo')).body as unknown as { fields: { id: string; key: string }[] };
    const suffix = settings.fields[0]?.id ?? '';
    const refused = await call('PUT', '/plugin-settings/seo', { values: {} });
    expect([refused.status, refused.body.error?.issues]).toEqual([422, [{ path: ['titleSuffix'], message: 'Fill this in.' }]]);
    expect((await call('PUT', '/plugin-settings/seo', { values: { [suffix]: ' | Lakeshore' } })).body['values']).toEqual({ [suffix]: ' | Lakeshore' });

    authenticator.session = as('editor');
    expect((await call('GET', '/plugins')).status).toBe(403);
    expect((await call('PATCH', '/plugins/seo', { enabled: false })).status).toBe(403);
    expect((await call('GET', '/plugin-settings/seo')).status).toBe(403);
    authenticator.session = as('owner');
    expect((await call('PATCH', '/plugins/seo', { enabled: 'yes' })).status).toBe(400);
    expect((await call('PATCH', '/plugins/nothing', { enabled: true })).status).toBe(404);
  });

  it('tells anyone signed in which running plugins add to the editor', async () => {
    expect((await call('GET', '/plugin-editors')).body).toEqual({ items: [] });
    await cms.plugins.load([definePlugin({ name: 'log', apiVersion: 1, label: { en: 'Log' }, editor: 'export default () => {};', setup: () => undefined })]);
    authenticator.session = as('author');
    expect((await call('GET', '/plugin-editors')).body).toEqual({ items: [{ name: 'log', label: { en: 'Log' } }] });
    authenticator.session = null;
    expect((await call('GET', '/plugin-editors')).status).toBe(401);
  });

  it('hands a request at a plugin\'s own address to the plugin, as the person who asked', async () => {
    authenticator.session = as('author');
    expect((await call('GET', '/plugins/seo/report/lakeshore-farmhouse?full=yes')).body).toEqual({ slug: 'lakeshore-farmhouse', full: true });
    // What the address requires is asked of the person, whoever wrote the plugin.
    expect((await call('POST', '/plugins/seo/notes', { text: 'hello' })).status).toBe(403);
    authenticator.session = as('editor');
    expect((await call('POST', '/plugins/seo/notes', { text: 'hello' })).status).toBe(200);
    expect((await call('GET', '/plugins/seo/nowhere')).status).toBe(404);
    expect((await call('GET', '/plugins/missing/report/x')).status).toBe(404);
    expect((await call('PATCH', '/plugins/seo/notes', {})).status).toBe(405);
  });

  it('keeps a plugin\'s addresses under the rules every address has', async () => {
    authenticator.session = null;
    expect((await call('GET', '/plugins/seo/report/x')).status).toBe(401);
    authenticator.session = as('editor');
    expect((await call('POST', '/plugins/seo/notes', { text: 'x' }, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await call('POST', '/plugins/seo/notes', 'text=x', { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(415);
    expect((await send('GET', '/plugins/seo/report/x')).headers.get('cache-control')).toBe('no-store');
  });

  it('says nothing of what broke inside a plugin, and notes it for the owner', async () => {
    const broken = await call('GET', '/plugins/seo/broken');
    expect(broken.status).toBe(502);
    expect(JSON.stringify(broken.body)).not.toContain('hunter2');
    expect(broken.body.error?.message).toBe('The plugin "seo" could not answer. An owner can see what went wrong under Plugins.');
    expect((await call('GET', '/plugins')).body['items']).toMatchObject([{ faults: 1 }]);
  });
});

describe('forms and what they were sent', () => {
  const formBody = { key: 'contact', label: { en: 'Contact us' }, fields: [{ key: 'email', type: 'email', label: { en: 'Email' }, required: true }], notify: ['office@example.com'], contact: { email: 'email' } };

  it('starts a form, changes it and lists it, each through the form service', async () => {
    const made = await call('POST', '/forms', formBody);
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ key: 'contact', revision: 1, notify: ['office@example.com'] });
    const id = String(made.body['id']);
    const changed = await call('PATCH', `/forms/${id}`, { open: false, success: null, expectedRevision: 1 });
    expect(changed.body).toMatchObject({ open: false, revision: 2 });
    expect(((await call('GET', '/forms')).body['items'] as unknown[]).length).toBe(1);
    expect((await call('PATCH', `/forms/${id}`, { open: true, expectedRevision: 1 })).status).toBe(409);
    expect((await call('PATCH', `/forms/${id}`, { open: true })).status).toBe(400);
    expect((await call('POST', '/forms', { ...formBody, secret: 'x' })).status).toBe(400);
  });

  it('moves a form to the trash, lists it there, restores it and deletes it for good', async () => {
    const id = String((await call('POST', '/forms', formBody)).body['id']);
    expect((await call('DELETE', `/forms/trash/${id}`)).status).toBe(409);
    expect((await call('DELETE', `/forms/${id}`)).body).toHaveProperty('deletedAt');
    expect(((await call('GET', '/forms/trash')).body['items'] as unknown[]).length).toBe(1);
    expect((await call('POST', `/forms/${id}/restore`)).body).not.toHaveProperty('deletedAt');
    await call('DELETE', `/forms/${id}`);
    expect(await call('DELETE', `/forms/trash/${id}`)).toEqual({ status: 200, body: {} });
    expect((await call('GET', '/forms/trash')).body).toEqual({ items: [] });
  });

  it('lists, counts, marks, exports and deletes submissions, and forgets a sender', async () => {
    const id = String((await call('POST', '/forms', formBody)).body['id']);
    await cms.submissions.submit('contact', { email: 'Ana@Example.com' });
    await cms.submissions.submit('contact', { email: 'bot@spam.example' }, { suspected: true });
    const listed = await call('GET', `/forms/${id}/submissions?status=new`);
    expect(listed.body).toMatchObject({ total: 1 });
    const [first] = listed.body['items'] as { id: string }[];
    expect((await call('GET', `/forms/${id}/submission-counts`)).body).toEqual({ new: 1, handled: 0, spam: 1 });
    expect((await call('GET', `/forms/${id}/submissions?status=old`)).status).toBe(400);
    expect((await call('PATCH', `/submissions/${first?.id}`, { status: 'handled' })).body).toMatchObject({ status: 'handled', handledBy: 'u1' });
    expect((await call('PATCH', `/submissions/${first?.id}`, { status: 'done' })).status).toBe(400);
    expect(String((await call('GET', `/forms/${id}/export`)).body['csv'])).toContain('Ana@Example.com');
    expect(await call('POST', '/submissions/forget', { email: 'ana@example.com' })).toEqual({ status: 200, body: { removed: 1 } });
    const [spam] = (await call('GET', `/forms/${id}/submissions`)).body['items'] as { id: string }[];
    expect(await call('DELETE', `/submissions/${spam?.id}`)).toEqual({ status: 200, body: {} });
    expect((await call('GET', `/forms/${id}/submissions`)).body).toMatchObject({ total: 0 });
  });

  it('keeps what visitors sent from an author, who may still see which forms there are', async () => {
    const id = String((await call('POST', '/forms', formBody)).body['id']);
    authenticator.session = as('author');
    expect((await call('GET', '/forms')).status).toBe(200);
    for (const path of [`/forms/${id}/submissions`, `/forms/${id}/submission-counts`, `/forms/${id}/export`, '/forms/trash']) {
      expect((await call('GET', path)).status).toBe(403);
    }
    expect((await call('POST', '/forms', { ...formBody, key: 'other' })).status).toBe(403);
    expect((await call('POST', '/submissions/forget', { email: 'ana@example.com' })).status).toBe(403);
  });

  it('never lets a browser keep what a visitor sent', async () => {
    const id = String((await call('POST', '/forms', formBody)).body['id']);
    expect((await send('GET', `/forms/${id}/submissions`)).headers.get('cache-control')).toBe('no-store');
    expect((await send('GET', `/forms/${id}/export`)).headers.get('cache-control')).toBe('no-store');
  });
});
