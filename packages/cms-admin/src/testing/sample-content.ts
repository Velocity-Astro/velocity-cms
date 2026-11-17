import type { ContentTypeDef, Entry, FieldDef } from '@velocity/cms-core';
import type { SessionUser } from '../client/admin-client.js';

/** A small real-estate site, for tests and the development preview. */
export const sampleUser: SessionUser = { id: 'u1', email: 'dana@example.com', name: 'Dana' };

const field = (id: string, key: string, type: string, label: string, changes: Partial<FieldDef> = {}): FieldDef => ({
  id,
  key,
  type,
  label: { en: label },
  translated: type === 'text',
  required: false,
  options: {},
  ...changes,
});

export const sampleContentTypes: readonly ContentTypeDef[] = [
  {
    id: 'type-listings',
    key: 'listings',
    kind: 'collection',
    label: { en: 'Listings', es: 'Propiedades' },
    urlPattern: '/listings/[slug]',
    // One field of every built-in type, so the editor shows every control.
    fields: [
      field('f-title', 'title', 'text', 'Title', { required: true }),
      field('f-description', 'description', 'text', 'Description', { options: { multiline: true } }),
      field('f-price', 'price', 'number', 'Price', { required: true, options: { min: 0, integer: true } }),
      field('f-stage', 'stage', 'select', 'Stage', { options: { choices: ['For sale', 'Under contract', 'Sold'] } }),
      field('f-listed', 'listedOn', 'date', 'Listed on'),
      field('f-featured', 'featured', 'boolean', 'Show on the homepage'),
      field('f-tour', 'virtualTour', 'url', 'Virtual tour'),
      field('f-address', 'address', 'group', 'Address', {
        options: {
          fields: [field('f-street', 'street', 'text', 'Street'), field('f-city', 'city', 'text', 'City', { required: true })],
        },
      }),
      field('f-photos', 'photos', 'list', 'Photos', { options: { of: { type: 'url' } } }),
    ],
  },
  {
    id: 'type-agents',
    key: 'agents',
    kind: 'collection',
    label: { en: 'Agents', es: 'Agentes' },
    urlPattern: '/agents/[slug]',
    fields: [field('f-name', 'name', 'text', 'Name', { required: true })],
  },
];

const hoursAgo = (hours: number, now: Date) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

/** Listings in each state the list can show. Times are relative to `now`, so the list always reads the same. */
export function sampleEntries(now: Date = new Date()): readonly Entry[] {
  const listing = (id: string, title: string, hours: number, city?: string): Entry => ({
    id,
    typeId: 'type-listings',
    locale: 'en',
    translationGroup: id,
    slug: title === '' ? id : title.toLowerCase().replaceAll(' ', '-'),
    status: 'draft',
    data: {
      ...(title !== '' && { 'f-title': title }),
      'f-price': 500000,
      'f-stage': 'For sale',
      ...(city !== undefined && { 'f-address': { 'f-street': title, 'f-city': city } }),
    },
    revision: 1,
    createdAt: hoursAgo(hours + 24, now),
    updatedAt: hoursAgo(hours, now),
  });
  /** The entry as it is after publishing, `savesSince` saves ago. */
  const published = (entry: Entry, publishedHoursAgo: number, savesSince = 0): Entry => ({
    ...entry,
    status: 'published',
    revision: 3 + savesSince,
    published: { slug: entry.slug, data: entry.data, revision: 3, at: hoursAgo(publishedHoursAgo, now) },
  });
  return [
    published(listing('e1', '6214 Lakeshore Drive', 2, 'Austin'), 2),
    listing('e2', '18 Alder Court', 26),
    published(listing('e3', '907 Mesa Verde Lane', 72, 'Santa Fe'), 96, 2),
    listing('e4', '', 200),
  ];
}
