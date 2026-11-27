import { createCms, type Actor, type Cms, type Entry } from '@velocity-astro/cms-core';
import { FakeClock, InMemoryEntryRepository, InMemoryLikeStore, InMemorySchemaRepository, SequentialIds } from '@velocity-astro/cms-core/testing';
import { beforeEach, expect, it } from 'vitest';
import { MemoryRateLimiter } from './form-post.js';
import { LikePosts, MAX_LIKE_POST_BYTES, visitorHash, type LikePostsOptions } from './like-post.js';

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const ORIGIN = 'https://lakeshore.example';
const SECRET = 'a-secret-of-at-least-thirty-two-characters';
const BROWSER = 'b5c1e0a2-4f1d-4c33-9a57-0f6ad8a1e3c4';

let cms: Cms;
let store: InMemoryLikeStore;
let post: Entry;
let postsId: string;

const taker = (options: Partial<LikePostsOptions> = {}) => new LikePosts({ cms, origin: ORIGIN, secret: SECRET, ...options });
const like = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/cms/likes`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const counts = (query: string) => new Request(`${ORIGIN}/api/cms/likes?${query}`);

beforeEach(async () => {
  store = new InMemoryLikeStore();
  cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), likes: store, clock: new FakeClock(), ids: new SequentialIds() });
  const posts = await cms.schema.create(owner, { key: 'posts', kind: 'collection', label: { en: 'Posts' }, urlPattern: '/blog/[slug]', likes: true });
  postsId = posts.id;
  post = await cms.content.publish(owner, (await cms.content.create(owner, { typeId: posts.id, locale: 'en', slug: 'hello', data: {} })).id);
});

it('likes an entry from the site’s own page, keeps only a hash of the browser, and counts a second like once', async () => {
  const response = await taker().handle(like({ type: 'posts', entry: post.translationGroup, browser: BROWSER, liked: true }), '203.0.113.7');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ liked: true, count: 1 });
  expect(await (await taker().handle(like({ type: 'posts', entry: post.translationGroup, browser: BROWSER, liked: true }))).json()).toEqual({ liked: true, count: 1 });
  const hash = await visitorHash(SECRET, BROWSER);
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  expect(await store.has(postsId, post.translationGroup, hash)).toBe(true);
  expect(await store.has(postsId, post.translationGroup, BROWSER)).toBe(false);
  // Another site's secret makes another hash of the same browser.
  expect(await visitorHash('another-secret-of-thirty-two-characters!', BROWSER)).not.toBe(hash);

  expect(await (await taker().handle(like({ type: 'posts', entry: post.translationGroup, browser: BROWSER, liked: false }))).json()).toEqual({ liked: false, count: 0 });
});

it('names an entry by the live loader’s id as well as by its translation group', async () => {
  expect(await (await taker().handle(like({ type: 'posts', entry: 'en/hello', browser: BROWSER, liked: true }))).json()).toEqual({ liked: true, count: 1 });
  expect(await (await taker().handle(counts(`type=posts&entries=en/hello,${post.translationGroup},en/nothing`))).json()).toEqual({ counts: { 'en/hello': 1, [post.translationGroup]: 1 } });
});

it('refuses a like from another site, one sent without saying where from, and one that is not JSON', async () => {
  const body = { type: 'posts', entry: post.translationGroup, browser: BROWSER, liked: true };
  expect((await taker().handle(like(body, { origin: 'https://elsewhere.example' }))).status).toBe(403);
  const unnamed = new Request(`${ORIGIN}/api/cms/likes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  expect((await taker().handle(unnamed)).status).toBe(403);
  expect((await taker().handle(like(body, { 'content-type': 'text/plain' }))).status).toBe(415);
  expect((await taker().handle(like({ ...body, padding: 'x'.repeat(MAX_LIKE_POST_BYTES) }))).status).toBe(413);
  expect((await taker().handle(new Request(`${ORIGIN}/api/cms/likes`, { method: 'DELETE' }))).status).toBe(405);
  expect(await store.counts(postsId)).toEqual({});
});

it('answers a draft, a type without likes and a made-up browser as nothing to like, and says nothing it was sent back', async () => {
  const draft = await cms.content.create(owner, { typeId: postsId, locale: 'en', slug: 'draft', data: {} });
  const refused = await taker().handle(like({ type: 'posts', entry: draft.translationGroup, browser: BROWSER, liked: true }));
  expect(refused.status).toBe(404);
  expect(JSON.stringify(await refused.json())).not.toContain(draft.translationGroup);
  expect((await taker().handle(like({ type: 'pages', entry: post.translationGroup, browser: BROWSER, liked: true }))).status).toBe(404);
  expect((await taker().handle(like({ type: 'posts', entry: post.translationGroup, browser: 'me@example.com', liked: true }))).status).toBe(400);
  expect((await taker().handle(like({ type: 'posts', entry: post.translationGroup, browser: BROWSER }))).status).toBe(400);
});

it('stops one address that sends too many likes, and one that asks too often', async () => {
  const limited = taker({ limiter: new MemoryRateLimiter(2), readLimiter: new MemoryRateLimiter(1) });
  const body = (n: number) => ({ type: 'posts', entry: post.translationGroup, browser: `${BROWSER.slice(0, 30)}${n}`, liked: true });
  expect((await limited.handle(like(body(1)), '203.0.113.7')).status).toBe(200);
  expect((await limited.handle(like(body(2)), '203.0.113.7')).status).toBe(200);
  const third = await limited.handle(like(body(3)), '203.0.113.7');
  expect(third.status).toBe(429);
  expect(third.headers.get('retry-after')).toBe('600');
  expect((await limited.handle(like(body(4)), '198.51.100.1')).status).toBe(200);
  expect((await limited.handle(counts(`type=posts&entries=${post.translationGroup}`), '203.0.113.7')).status).toBe(200);
  expect((await limited.handle(counts(`type=posts&entries=${post.translationGroup}`), '203.0.113.7')).status).toBe(429);
});

it('gives a listing its counts only when the type shows them', async () => {
  await taker().handle(like({ type: 'posts', entry: post.translationGroup, browser: BROWSER, liked: true }));
  expect(await (await taker().handle(counts(`type=posts&entries=${post.translationGroup}`))).json()).toEqual({ counts: { [post.translationGroup]: 1 } });
  await cms.schema.update(owner, postsId, { likes: { showCount: false } });
  expect(await (await taker().handle(counts(`type=posts&entries=${post.translationGroup}`))).json()).toEqual({ counts: {} });
  expect(await (await taker().handle(like({ type: 'posts', entry: post.translationGroup, browser: BROWSER, liked: true }))).json()).toEqual({ liked: true });
  expect((await taker().handle(counts('type=posts'))).status).toBe(400);
});
