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
import { definePlugin } from '@velocity/cms-core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The demo site's own plugin file, so the preview shows what a real site would.
import publishLogEditor from '../../../prototypes/live-site/files/publish-log-editor.js';
import { AdminApp, type PluginEditorModule } from '../src/index.js';
import { MemoryAdminClient, sampleContentTypes, sampleEntries, sampleUser } from '../src/testing/index.js';

const options = new URLSearchParams(location.search);
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
    {
      name: 'seo',
      apiVersion: 1,
      label: { en: 'SEO' },
      description: { en: 'Titles, descriptions and a check before publishing.' },
      version: '0.1.0',
      permissions: ['entry:read'],
      enabledByDefault: false,
      settings: [
        { key: 'titleSuffix', type: 'text', label: { en: 'Title ending' }, help: { en: 'Added to every page title, such as " | Lakeshore Realty".' }, required: true },
        { key: 'maxLength', type: 'number', label: { en: 'Longest description' }, help: { en: 'In characters. Search engines cut longer ones short.' } },
        { key: 'requireDescription', type: 'boolean', label: { en: 'Require a description before publishing' } },
      ],
      setup: () => undefined,
    },
    { name: 'redirects', apiVersion: 1, label: { en: 'Redirects' }, description: { en: 'Send old addresses to new pages.' }, version: '0.1.0', permissions: ['entry:read', 'entry:write'], enabledByDefault: false, setup: () => undefined },
    { name: 'forms', apiVersion: 2, label: { en: 'Forms' }, setup: () => undefined },
  ],
  contentTypes: sampleContentTypes,
  entries: sampleEntries(),
  ...(options.has('slow') && { delay: 1500 }),
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AdminApp
      client={client}
      siteName="Lakeshore Realty"
      basePath="/"
      pluginEditors={async (name) => {
        if (name !== 'publish-log') throw new Error(`The preview has no editor file for "${name}".`);
        return { default: publishLogEditor } as PluginEditorModule;
      }}
    />
  </StrictMode>,
);
