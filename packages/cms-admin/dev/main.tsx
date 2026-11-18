/**
 * The development preview: the whole editor against an in-memory server, so screens can be
 * worked on without a site or a database.
 *
 *   pnpm --filter @velocity/cms-admin dev
 *
 * Add `?signed-out` to the address to start at the sign-in screen, `?dark` for the dark theme, and
 * `?slow` to make every request take a while, to see what each screen shows while it waits.
 */
import '@velocity/cms-ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from '../src/index.js';
import { MemoryAdminClient, sampleContentTypes, sampleEntries, sampleUser } from '../src/testing/index.js';

const options = new URLSearchParams(location.search);
document.documentElement.classList.toggle('dark', options.has('dark'));

const client = new MemoryAdminClient({
  ...(!options.has('signed-out') && { user: sampleUser }),
  passkeyUser: sampleUser,
  showUploads: true,
  plugins: [
    { name: 'publish-log', apiVersion: 1, label: { en: 'Publish log' }, description: { en: "Notes every publish in the server's log." }, version: '1.0.0', setup: () => undefined },
    { name: 'seo', apiVersion: 1, label: { en: 'SEO' }, description: { en: 'Titles, descriptions and a check before publishing.' }, version: '0.1.0', permissions: ['entry:read'], setup: () => { throw new Error('SEO_API_KEY is not set.'); } },
    { name: 'forms', apiVersion: 2, label: { en: 'Forms' }, setup: () => undefined },
  ],
  contentTypes: sampleContentTypes,
  entries: sampleEntries(),
  ...(options.has('slow') && { delay: 1500 }),
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AdminApp client={client} siteName="Lakeshore Realty" basePath="/" />
  </StrictMode>,
);
