import { beforeEach, expect, it } from 'vitest';
import type { Actor } from './access.js';
import { createCms, type Cms } from './cms.js';
import { ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import type { ContentTypeDef, Entry } from './model.js';
import { InMemoryEntryRepository, InMemoryLikeStore, InMemorySchemaRepository, SequentialIds, likeStoreContract } from './testing/index.js';

likeStoreContract('InMemoryLikeStore', async () => new InMemoryLikeStore());

const maya: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const sam: Actor = { kind: 'user', id: 'sam', role: 'author' };
const nobody: Actor = { kind: 'agent', id: 'token-1', role: 'author', permissions: [] };
const visitor = (letter: string) => letter.repeat(64);

let cms: Cms;
let posts: ContentTypeDef;
let post: Entry;

beforeEach(async () => {
  cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), ids: new SequentialIds() });
  posts = await cms.schema.create(maya, { key: 'posts', kind: 'collection', label: { en: 'Posts' }, urlPattern: '/blog/[slug]', fields: [{ key: 'title', type: 'text', label: { en: 'Title' } }], likes: true });
  post = await cms.content.publish(maya, (await cms.content.create(maya, { typeId: posts.id, locale: 'en', slug: 'hello', data: {} })).id);
});

it('takes a type that takes likes from its description, showing the count unless it says not to', async () => {
  expect(posts.likes).toEqual({ showCount: true });
  const quiet = await cms.schema.create(maya, { key: 'recipes', kind: 'collection', label: { en: 'Recipes' }, likes: { showCount: false } });
  expect(quiet.likes).toEqual({ showCount: false });
  // A description that says nothing of likes leaves what the editor chose.
  expect((await cms.schema.define(maya, { key: 'recipes', kind: 'collection', label: { en: 'Recipes' } })).likes).toEqual({ showCount: false });
  expect((await cms.schema.define(maya, { key: 'recipes', kind: 'collection', label: { en: 'Recipes' }, likes: true })).likes).toEqual({ showCount: false });
  expect((await cms.schema.define(maya, { key: 'recipes', kind: 'collection', label: { en: 'Recipes' }, likes: false })).likes).toBeUndefined();
  const plain = await cms.schema.create(maya, { key: 'pages', kind: 'collection', label: { en: 'Pages' } });
  expect(plain.likes).toBeUndefined();
});

it('is switched on and off in a type’s settings, and keeps the likes made when it is off', async () => {
  await cms.likes.like({ type: 'posts', entry: post.translationGroup }, visitor('a'));
  expect((await cms.schema.update(maya, posts.id, { likes: { showCount: false } })).likes).toEqual({ showCount: false });
  // Changing something else leaves likes as they are.
  expect((await cms.schema.update(maya, posts.id, { label: { en: 'Articles' } })).likes).toEqual({ showCount: false });
  expect((await cms.schema.update(maya, posts.id, { likes: null })).likes).toBeUndefined();
  await expect(cms.likes.like({ type: 'posts', entry: post.translationGroup }, visitor('b'))).rejects.toBeInstanceOf(NotFoundError);
  await cms.schema.update(maya, posts.id, { likes: { showCount: true } });
  expect(await cms.likes.state({ type: 'posts', entry: post.translationGroup })).toEqual({ liked: false, count: 1 });
});

it('counts a visitor once, takes a like back, and announces each change without saying who', async () => {
  const heard: unknown[] = [];
  cms.events.on('entry.liked', (payload) => void heard.push(payload));
  const subject = { type: 'posts', entry: post.translationGroup };
  expect(await cms.likes.like(subject, visitor('a'))).toEqual({ liked: true, count: 1 });
  expect(await cms.likes.like(subject, visitor('a'))).toEqual({ liked: true, count: 1 });
  expect(await cms.likes.like(subject, visitor('b'))).toEqual({ liked: true, count: 2 });
  expect(await cms.likes.state(subject, visitor('a'))).toEqual({ liked: true, count: 2 });
  expect(await cms.likes.state(subject, visitor('c'))).toEqual({ liked: false, count: 2 });
  expect(await cms.likes.like(subject, visitor('a'), false)).toEqual({ liked: false, count: 1 });
  expect(heard).toEqual([
    { typeId: posts.id, entry: post.translationGroup, liked: true, count: 1 },
    { typeId: posts.id, entry: post.translationGroup, liked: true, count: 2 },
    { typeId: posts.id, entry: post.translationGroup, liked: false, count: 1 },
  ]);
});

it('tells a page nothing of the count when the type does not show it, and the editor everything', async () => {
  await cms.schema.update(maya, posts.id, { likes: { showCount: false } });
  const subject = { type: 'posts', entry: post.translationGroup };
  expect(await cms.likes.like(subject, visitor('a'))).toEqual({ liked: true });
  expect(await cms.likes.state(subject)).toEqual({ liked: false });
  expect(await cms.likes.publicCounts('posts', [post.translationGroup])).toEqual({});
  expect(await cms.likes.counts(sam, posts.id)).toEqual({ [post.translationGroup]: 1 });
});

it('answers only for a published entry of a type that takes likes, as if anything else were not there', async () => {
  const draft = await cms.content.create(maya, { typeId: posts.id, locale: 'en', slug: 'draft', data: {} });
  await expect(cms.likes.like({ type: 'posts', entry: draft.translationGroup }, visitor('a'))).rejects.toBeInstanceOf(NotFoundError);
  await expect(cms.likes.like({ type: 'pages', entry: post.translationGroup }, visitor('a'))).rejects.toBeInstanceOf(NotFoundError);
  await expect(cms.likes.like({ type: 'posts', entry: '../x' }, visitor('a'))).rejects.toBeInstanceOf(NotFoundError);
  await expect(cms.likes.like({ type: 'posts', entry: post.translationGroup }, 'someone@example.com')).rejects.toBeInstanceOf(ValidationError);
  await cms.content.trash(maya, post.id);
  await expect(cms.likes.state({ type: 'posts', entry: post.translationGroup })).rejects.toBeInstanceOf(NotFoundError);
});

it('counts the entries a listing asks about, leaving out what is not on the site, and refuses too many at once', async () => {
  const second = await cms.content.publish(maya, (await cms.content.create(maya, { typeId: posts.id, locale: 'en', slug: 'second', data: {} })).id);
  const draft = await cms.content.create(maya, { typeId: posts.id, locale: 'en', slug: 'draft', data: {} });
  await cms.likes.like({ type: 'posts', entry: post.translationGroup }, visitor('a'));
  expect(await cms.likes.publicCounts('posts', [post.translationGroup, second.translationGroup, draft.translationGroup, 'nothing'])).toEqual({ [post.translationGroup]: 1, [second.translationGroup]: 0 });
  expect(await cms.likes.publicCounts('pages', [post.translationGroup])).toEqual({});
  await expect(cms.likes.publicCounts('posts', Array.from({ length: 101 }, (_, n) => `e${n}`))).rejects.toBeInstanceOf(ValidationError);
});

it('lists the most liked entries for whoever may read content, and forgets an entry’s likes when it is deleted for good', async () => {
  const second = await cms.content.publish(maya, (await cms.content.create(maya, { typeId: posts.id, locale: 'en', slug: 'second', data: {} })).id);
  await cms.likes.like({ type: 'posts', entry: second.translationGroup }, visitor('a'));
  await cms.likes.like({ type: 'posts', entry: second.translationGroup }, visitor('b'));
  await cms.likes.like({ type: 'posts', entry: post.translationGroup }, visitor('a'));
  expect(await cms.likes.top(sam)).toEqual([
    { typeId: posts.id, entry: second.translationGroup, count: 2 },
    { typeId: posts.id, entry: post.translationGroup, count: 1 },
  ]);
  await expect(cms.likes.top(nobody)).rejects.toBeInstanceOf(ForbiddenError);
  await expect(cms.likes.counts(nobody, posts.id)).rejects.toBeInstanceOf(ForbiddenError);

  await cms.content.trash(maya, second.id);
  // In the trash, an entry keeps its likes: it may come back.
  expect(await cms.likes.counts(maya, posts.id)).toEqual({ [second.translationGroup]: 2, [post.translationGroup]: 1 });
  await cms.content.delete(maya, second.id);
  expect(await cms.likes.counts(maya, posts.id)).toEqual({ [post.translationGroup]: 1 });
});

it('leaves an archived type out of the most liked', async () => {
  await cms.likes.like({ type: 'posts', entry: post.translationGroup }, visitor('a'));
  await cms.schema.archive(maya, posts.id);
  expect(await cms.likes.top(maya)).toEqual([]);
});
