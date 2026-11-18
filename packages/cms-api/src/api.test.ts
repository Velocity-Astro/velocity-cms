import { createCms, type Actor, type Cms, type ContentTypeDef, type Entry } from '@velocity/cms-core';
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
    media: { storage: { files: new InMemoryMediaRepository(), store: new InMemoryMediaStore() }, maxBytes: 2000 },
  });
  cms.media.include(new InMemoryImageLibrary([{ name: 'porch', url: '/_astro/porch.jpg' }]));
  listings = await cms.schema.create(as('owner').actor, {
    key: 'listings',
    kind: 'collection',
    label: { en: 'Listings' },
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
    expect((await call('GET', '/session')).body).toEqual({ user: dana });
    authenticator.session = null;
    expect(await call('GET', '/session')).toEqual({ status: 200, body: { user: null } });
  });

  it('refuses everything else until someone signs in', async () => {
    authenticator.session = null;
    for (const [method, path] of [['GET', '/content-types'], ['GET', '/field-types'], ['GET', '/entries?type=listings'], ['GET', '/entries/x'], ['POST', '/entries'], ['PATCH', '/entries/x'], ['POST', '/entries/x/publish'], ['POST', '/entries/x/unpublish']] as const) {
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
    expect(fieldTypes.body['items']).toContainEqual({ type: 'text', editor: 'text-input' });
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

describe('the edges', () => {
  it('answers 404 outside its routes and 405 for a method an address does not take', async () => {
    expect((await call('GET', '/nothing-here')).status).toBe(404);
    expect((await api.handle(new Request(`${SITE}/elsewhere`))).status).toBe(404);
    const response = await send('DELETE', '/entries/x');
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, PATCH');
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
    expect(await response.json()).toEqual({ name: 'kitchen', url: '/media/kitchen.png', width: 800, height: 600 });
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
