/**
 * The development preview: the whole editor against an in-memory server, so screens can be
 * worked on without a site or a database.
 *
 *   pnpm --filter @velocity-astro/cms-admin dev
 *
 * Add `?signed-out` to the address to start at the sign-in screen, `?dark` for the dark theme, and
 * `?slow` to make every request take a while, to see what each screen shows while it waits.
 */
import '@velocity-astro/cms-ui/styles.css';
import { definePlugin } from '@velocity-astro/cms-core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// A plugin's editor file as a site would ship one, so the preview shows what a real site would.
import publishLogEditor from './publish-log-editor.js';
// Read from its source, so the preview needs no build of it.
import { seo } from '../../cms-plugins/src/index.js';
import { AdminApp, type PluginEditorModule } from '../src/index.js';
import type { Entry } from '@velocity-astro/cms-core';
import { MemoryAdminClient, sampleBusiness, sampleBusinessType, sampleContentTypes, sampleEntries, sampleNavigation, sampleNavigationType, samplePage, samplePagesType, sampleUser } from '../src/testing/index.js';
import { sampleForms, sampleSubmissions } from '../src/testing/sample-content.js';

const options = new URLSearchParams(location.search);

/**
 * With `?rich`, a site as full as a real one: sixteen listings in every state, forms with what was
 * sent through them, and deals in each stage, so a screen is judged with content in it.
 */
const isRich = options.has('rich');
const STREETS = ['1104 Elm Commons', '1800 Main Street', '3021 Willow Bend Court', '512 Cole Street', '918 Meadow Glen Drive', '2209 Vista Avenue', '77 Harbor View', '4410 Ridge Road', '15 Orchard Lane', '630 Birch Hollow', '2875 Lakeview Terrace', '91 Mill Pond Way'];
const richListings = (now: Date): Entry[] =>
  STREETS.map((street, index) => {
    const at = new Date(now.getTime() - (index * 7 + 3) * 3600_000).toISOString();
    const slug = street.toLowerCase().replaceAll(' ', '-');
    const data = { 'f-title': street, 'f-price': 250000 + index * 41000, 'f-stage': index % 4 === 0 ? 'Sold' : 'For sale', 'f-address': { 'f-street': street, 'f-city': index % 2 ? 'Austin' : 'Round Rock' } };
    const isDraft = index % 5 === 4;
    return {
      id: `rich-${index}`,
      typeId: 'type-listings',
      locale: 'en',
      translationGroup: `rich-${index}`,
      slug,
      status: isDraft ? 'draft' : 'published',
      data,
      revision: isDraft ? 1 : 3,
      ...(!isDraft && { published: { slug, data, revision: 3, at } }),
      createdAt: at,
      updatedAt: at,
    } satisfies Entry;
  });
document.documentElement.classList.toggle('dark', options.has('dark'));

const client = new MemoryAdminClient({
  ...(!options.has('signed-out') && { user: sampleUser }),
  passkeyUser: sampleUser,
  showUploads: true,
  plugins: [
    definePlugin({
      name: 'publish-log',
      apiVersion: 1,
      label: { en: 'Publish log' },
      description: { en: 'Keeps a list of what was published and when.' },
      version: '1.1.0',
      // Any text will do here: the preview hands the editor the file itself, below.
      editor: 'preview',
      setup(cms) {
        cms.events.on('entry.published', async ({ entry }) => {
          const type = await cms.schema.get(entry.typeId);
          const before = await cms.store.get('log');
          const line = { slug: entry.slug, locale: entry.locale, type: type.label['en'] ?? type.key, at: new Date().toISOString() };
          await cms.store.set('log', [line, ...(Array.isArray(before) ? (before as unknown[]) : [])].slice(0, 50));
        });
        cms.routes.add('GET', '/log', async () => ({ items: (await cms.store.get('log')) ?? [] }));
      },
    }),
    // The SEO plugin that comes with the CMS, as every site has it: available until an owner activates it.
    seo,
    { name: 'redirects', apiVersion: 1, label: { en: 'Redirects' }, description: { en: 'Send old addresses to new pages.' }, version: '0.1.0', permissions: ['entry:read', 'entry:write'], enabledByDefault: false, setup: () => undefined },
    { name: 'forms', apiVersion: 2, label: { en: 'Forms' }, setup: () => undefined },
  ],
  contentTypes: [...sampleContentTypes, samplePagesType, sampleNavigationType, sampleBusinessType],
  entries: [...sampleEntries(), samplePage(), sampleNavigation(), sampleBusiness(), ...(isRich ? richListings(new Date()) : [])],
  ...(isRich && { forms: sampleForms, submissions: sampleSubmissions }),
  ...(options.has('slow') && { delay: 1500 }),
});

if (isRich) {
  // Deals for whoever wrote in, one in each stage, worth what a listing might be.
  const contacts = (await client.listContacts()).items;
  const stages = ['new', 'contacted', 'qualified', 'won', 'qualified', 'new'];
  for (const [index, stage] of stages.entries()) {
    const contact = contacts[index % contacts.length];
    if (contact) await client.createDeal({ contactId: contact.id, title: `${STREETS[index] ?? 'A home'}`, value: 4000 + index * 2500, stage });
  }
  const pipeline = await client.getPipeline();
  await client.savePipeline({ stages: pipeline.stages, monthlyTarget: 25000, expectedRevision: pipeline.revision });
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AdminApp
      client={client}
      siteName="Lakeshore Realty"
      basePath="/"
      pluginEditors={async (name) => {
        if (name === 'publish-log') return { default: publishLogEditor } as PluginEditorModule;
        // The text a site would serve at /plugins/seo.js, run as the module it is.
        if (name === 'seo') return import(/* @vite-ignore */ URL.createObjectURL(new Blob([seo.editor ?? ''], { type: 'text/javascript' }))) as Promise<PluginEditorModule>;
        throw new Error(`The preview has no editor file for "${name}".`);
      }}
    />
  </StrictMode>,
);
