import type { ContentTypeDef, Entry } from '@velocity/cms-core';
import type { SessionUser } from '../client/admin-client.js';

/** A small real-estate site, for tests and the development preview. */
export const sampleUser: SessionUser = { id: 'u1', email: 'dana@example.com', name: 'Dana' };

const field = (id: string, key: string, type: string, label: string) => ({
  id,
  key,
  type,
  label: { en: label },
  translated: type === 'text',
  required: key === 'title',
  options: {},
});

export const sampleContentTypes: readonly ContentTypeDef[] = [
  {
    id: 'type-listings',
    key: 'listings',
    kind: 'collection',
    label: { en: 'Listings', es: 'Propiedades' },
    urlPattern: '/listings/[slug]',
    fields: [field('f-title', 'title', 'text', 'Title'), field('f-price', 'price', 'number', 'Price')],
  },
  {
    id: 'type-agents',
    key: 'agents',
    kind: 'collection',
    label: { en: 'Agents', es: 'Agentes' },
    urlPattern: '/agents/[slug]',
    fields: [field('f-name', 'name', 'text', 'Name')],
  },
];

const hoursAgo = (hours: number, now: Date) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

/** Listings in each state the list can show. Times are relative to `now`, so the list always reads the same. */
export function sampleEntries(now: Date = new Date()): readonly Entry[] {
  const listing = (id: string, title: string, hours: number, changes: Partial<Entry> = {}): Entry => ({
    id,
    typeId: 'type-listings',
    locale: 'en',
    translationGroup: id,
    slug: title.toLowerCase().replaceAll(' ', '-'),
    status: 'draft',
    data: { 'f-title': title, 'f-price': 500000 },
    revision: 1,
    createdAt: hoursAgo(hours + 24, now),
    updatedAt: hoursAgo(hours, now),
    ...changes,
  });
  const published = (revision: number, hours: number) => ({ slug: 'x', data: {}, revision, at: hoursAgo(hours, now) });
  return [
    listing('e1', '6214 Lakeshore Drive', 2, { status: 'published', revision: 3, published: published(3, 2) }),
    listing('e2', '18 Alder Court', 26),
    listing('e3', '907 Mesa Verde Lane', 72, { status: 'published', revision: 5, published: published(4, 96) }),
    listing('e4', '', 200),
  ];
}
