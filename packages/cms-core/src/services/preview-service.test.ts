import { expect, it } from 'vitest';
import type { Actor } from '../access.js';
import { createCms } from '../cms.js';
import { PreviewLinks } from '../preview.js';
import type { NewContentType } from './schema-service.js';
import { InMemoryEntryRepository, InMemorySchemaRepository } from '../testing/index.js';

const SECRET = 's'.repeat(32);
const owner: Actor = { kind: 'user', id: 'u1', role: 'owner' };
const NOW = '2026-01-01T00:00:00.000Z';

async function site(secret: string | null = SECRET) {
  const cms = createCms({
    entries: new InMemoryEntryRepository(),
    types: new InMemorySchemaRepository(),
    clock: { now: () => NOW },
    ...(secret !== null && { previews: { secret } }),
  });
  const types: NewContentType[] = [
    {
      key: 'listings',
      kind: 'collection',
      label: { en: 'Listings' },
      urlPattern: '/listings/[path]',
      localizedUrlPatterns: { es: '/es/propiedades/[path]' },
      fields: [
        { key: 'title', type: 'text', label: { en: 'Title' } },
        { key: 'path', type: 'text', label: { en: 'Web address' } },
      ],
    },
    { key: 'agents', kind: 'collection', label: { en: 'Agents' }, urlPattern: '/agents/[slug]', fields: [{ key: 'name', type: 'text', label: { en: 'Name' } }] },
    { key: 'reviews', kind: 'collection', label: { en: 'Reviews' }, fields: [{ key: 'words', type: 'text', label: { en: 'Words' } }] },
  ];
  for (const type of types) await cms.schema.define(owner, type);
  const idOf = async (typeKey: string, fieldKey: string) => (await cms.schema.getByKey(typeKey)).fields.find((field) => field.key === fieldKey)?.id ?? '';
  const add = async (typeKey: string, locale: string, slug: string, data: Record<string, unknown>) =>
    cms.content.create(owner, { typeId: (await cms.schema.getByKey(typeKey)).id, locale, slug, data });
  return { cms, idOf, add };
}

it('links to the page of a draft, in its own language, with a token that works for an hour', async () => {
  const { cms, idOf, add } = await site();
  const path = await idOf('listings', 'path');
  const english = await add('listings', 'en', 'oak-lane', { [path]: '12-oak-lane' });
  const spanish = await add('listings', 'es', 'oak-lane', { [path]: 'calle-roble-12' });
  const agent = await add('agents', 'en', 'maya-ellison', {});

  const link = await cms.previews.link(owner, english.id);
  const [address, token = ''] = link.path.split('?preview=');
  expect(address).toBe('/listings/12-oak-lane/');
  expect(await new PreviewLinks(SECRET, { now: () => NOW }).verify(token)).toBe(true);
  expect(link.expiresAt).toBe('2026-01-01T01:00:00.000Z');

  expect((await cms.previews.link(owner, spanish.id)).path).toMatch(/^\/es\/propiedades\/calle-roble-12\/\?preview=/);
  expect((await cms.previews.link(owner, agent.id)).path).toMatch(/^\/agents\/maya-ellison\/\?preview=/);
});

it('says why there is nothing to preview', async () => {
  const { cms, idOf, add } = await site();
  const review = await add('reviews', 'en', 'r1', {});
  await expect(cms.previews.link(owner, review.id)).rejects.toThrow(/no page of its own/);
  const agentInSpanish = await add('agents', 'es', 'maya-ellison', {});
  await expect(cms.previews.link(owner, agentInSpanish.id)).rejects.toThrow(/no page of its own in "es"/);
  const noAddress = await add('listings', 'en', 'new-home', {});
  await expect(cms.previews.link(owner, noAddress.id)).rejects.toThrow(/no web address yet/);
  // An address is one plain segment. Anything else is not put in a link.
  const odd = await add('listings', 'en', 'odd', { [await idOf('listings', 'path')]: '../admin' });
  await expect(cms.previews.link(owner, odd.id)).rejects.toThrow(/no web address yet/);
  await expect(cms.previews.link(owner, 'missing')).rejects.toThrow(/not found|No /i);
});

it('makes no links on a site without a secret', async () => {
  const { cms, add } = await site(null);
  expect(cms.previews.isOn).toBe(false);
  const agent = await add('agents', 'en', 'maya-ellison', {});
  await expect(cms.previews.link(owner, agent.id)).rejects.toThrow(/VELOCITY_CMS_SECRET/);
});
