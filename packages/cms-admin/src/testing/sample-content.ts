import type { NewForm } from '@velocity-astro/cms-core';
import type { SeedSubmission } from './memory-client.js';
import type { ContentTypeDef, Entry, FieldDef } from '@velocity-astro/cms-core';
import type { SessionUser } from '../client/admin-client.js';

/** A small real-estate site, for tests and the development preview. */
export const sampleUser: SessionUser = { id: 'u1', email: 'dana@example.com', name: 'Dana', role: 'owner' };

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

/**
 * A type whose entries are pages built from sections, and one page of it. Kept apart from the
 * types above, so a test or the preview adds them when it is about pages.
 */
export const samplePagesType: ContentTypeDef = {
  id: 'type-pages',
  key: 'pages',
  kind: 'collection',
  label: { en: 'Pages' },
  urlPattern: '/[slug]',
  fields: [
    field('f-page-title', 'title', 'text', 'Title', { required: true }),
    field('f-body', 'body', 'blocks', 'Sections', {
      options: {
        blocks: [
          {
            id: 'b-hero',
            key: 'page-hero',
            label: { en: 'Page opening' },
            description: { en: 'The page\'s heading and a line under it.' },
            icon: 'layout-template',
            group: 'Opening',
            fields: [field('bf-hero-title', 'title', 'text', 'Heading', { required: true }), field('bf-hero-text', 'text', 'text', 'Line under it', { options: { multiline: true } })],
          },
          {
            id: 'b-text',
            key: 'text',
            label: { en: 'Text' },
            description: { en: 'A heading with paragraphs under it.' },
            icon: 'text',
            group: 'Content',
            fields: [field('bf-text-title', 'title', 'text', 'Heading'), field('bf-text-body', 'body', 'text', 'Words', { options: { multiline: true } })],
          },
          {
            id: 'b-cta',
            key: 'call-to-action',
            label: { en: 'Call to action' },
            description: { en: 'A closing line with a button.' },
            icon: 'megaphone',
            group: 'Action',
            fields: [
              field('bf-cta-title', 'title', 'text', 'Line', { required: true }),
              field('bf-cta-look', 'look', 'select', 'Look', { options: { choices: ['Plain', 'Bold'] } }),
            ],
          },
          {
            id: 'b-map',
            key: 'map',
            label: { en: 'Map' },
            fields: [field('bf-map-place', 'place', 'text', 'Place')],
            retiredAt: '2026-11-01T00:00:00.000Z',
          },
        ],
      },
    }),
  ],
};

export function samplePage(now: Date = new Date()): Entry {
  return {
    id: 'p1',
    typeId: 'type-pages',
    locale: 'en',
    translationGroup: 'p1',
    slug: 'why-list-with-us',
    status: 'draft',
    data: {
      'f-page-title': 'Why list with us',
      'f-body': [
        { id: 's1', block: 'b-hero', data: { 'bf-hero-title': 'Sell for more, with less to do', 'bf-hero-text': 'One agent from the first photo to the closing table.' } },
        { id: 's2', block: 'b-text', data: { 'bf-text-title': 'How we work' } },
        { id: 's3', block: 'b-map', data: { 'bf-map-place': 'Austin' } },
      ],
    },
    revision: 1,
    createdAt: hoursAgo(30, now),
    updatedAt: hoursAgo(3, now),
  };
}

/** The site's menus: one entry, whose links go to pages by name or to an address typed by hand. */
export const sampleNavigationType: ContentTypeDef = {
  id: 'type-navigation',
  key: 'navigation',
  kind: 'single',
  label: { en: 'Navigation' },
  fields: [
    field('f-header', 'header', 'list', 'Header links', {
      options: {
        of: {
          type: 'group',
          options: { fields: [field('f-link-label', 'label', 'text', 'Label', { required: true }), field('f-link-link', 'link', 'link', 'Goes to', { required: true })] },
        },
      },
    }),
  ],
};

export function sampleNavigation(now: Date = new Date()): Entry {
  return {
    id: 'n1',
    typeId: 'type-navigation',
    locale: 'en',
    translationGroup: 'n1',
    slug: 'navigation',
    status: 'draft',
    data: {
      'f-header': [
        { 'f-link-label': 'Why list with us', 'f-link-link': { kind: 'entry', type: 'pages', entry: 'p1' } },
        { 'f-link-label': 'Instagram', 'f-link-link': { kind: 'address', href: 'https://instagram.com/example' } },
      ],
    },
    revision: 1,
    createdAt: hoursAgo(30, now),
    updatedAt: hoursAgo(3, now),
  };
}

/**
 * A single page a template keeps in the settings, with the field that names the site. Kept apart
 * like the pages above.
 */
export const sampleBusinessType: ContentTypeDef = {
  id: 'type-business',
  key: 'business',
  kind: 'single',
  label: { en: 'Business details' },
  inSettings: true,
  siteNamePath: ['f-business-name'],
  fields: [
    field('f-business-name', 'name', 'text', 'Business name', { required: true, translated: false }),
    field('f-business-phone', 'phone', 'text', 'Phone', { translated: false }),
    field('f-business-email', 'email', 'text', 'Email', { translated: false }),
  ],
};

export function sampleBusiness(now: Date = new Date()): Entry {
  const data = { 'f-business-name': 'Lakeshore Realty', 'f-business-phone': '512 555 0142', 'f-business-email': 'hello@lakeshore.example' };
  return {
    id: 'b1',
    typeId: 'type-business',
    locale: 'en',
    translationGroup: 'b1',
    slug: 'business',
    status: 'published',
    data,
    revision: 2,
    published: { slug: 'business', data, revision: 2, at: new Date(now.getTime() - 60 * 60 * 1000).toISOString() },
    createdAt: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
  };
}

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

/** Two forms a site might have: a contact form with people to tell, and a tour request. */
export const sampleForms: readonly NewForm[] = [
  {
    key: 'contact',
    label: { en: 'Contact us' },
    fields: [
      { key: 'name', type: 'text', label: { en: 'Your name' }, required: true },
      { key: 'email', type: 'email', label: { en: 'Email' }, required: true },
      { key: 'message', type: 'text', label: { en: 'Message' }, required: true, options: { multiline: true } },
    ],
    notify: ['office@example.com'],
    contact: { name: 'name', email: 'email' },
    success: { en: 'Thank you. We will be in touch.' },
  },
  {
    key: 'tour',
    label: { en: 'Book a tour' },
    fields: [
      { key: 'email', type: 'email', label: { en: 'Email' }, required: true },
      { key: 'day', type: 'date', label: { en: 'Preferred day' } },
    ],
    contact: { email: 'email' },
  },
];

/** What visitors sent through them, oldest first. */
export const sampleSubmissions: readonly SeedSubmission[] = [
  { form: 'contact', sent: { name: 'Ana Ruiz', email: 'Ana@Example.com', message: 'Is the house on Alder still for sale?' }, page: '/contact/' },
  { form: 'contact', sent: { name: 'Cheap Loans', email: 'win@spam.example', message: 'Click here now' }, suspected: true },
  { form: 'contact', sent: { name: 'Tom Okafor', email: 'tom@example.com', message: 'We would like to list our home.\nCall any time.' }, page: '/sell/' },
  { form: 'tour', sent: { email: 'ana@example.com', day: '2026-12-01' }, page: '/listings/18-alder-court/' },
];
