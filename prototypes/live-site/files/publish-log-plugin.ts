/**
 * A small plugin of the site's own, here to show the shape of one. It keeps the last publishes
 * in the plugin's own store, answers with them at its own address, and adds a "Publish log"
 * screen to the editor's sidebar. Named under `plugins` in astro.config.mjs, and listed under
 * Plugins in the editor, where an owner switches it on and off.
 */
import { definePlugin } from '@velocity/cms-astro';
// The plugin's part of the editor: one ready-made JavaScript file, handed over as text.
import editor from './publish-log-editor.js?raw';

interface Published {
  readonly slug: string;
  readonly locale: string;
  readonly type: string;
  readonly at: string;
}

const KEPT = 50;
const isList = (value: unknown): value is Published[] => Array.isArray(value);

export default definePlugin({
  name: 'publish-log',
  apiVersion: 1,
  label: { en: 'Publish log' },
  description: { en: 'Keeps a list of what was published and when.' },
  version: '1.1.0',
  editor,
  setup(cms) {
    cms.events.on('entry.published', async ({ entry }) => {
      const type = await cms.schema.get(entry.typeId);
      const before = await cms.store.get('log');
      const line: Published = { slug: entry.slug, locale: entry.locale, type: type.label['en'] ?? type.key, at: new Date().toISOString() };
      await cms.store.set('log', [line, ...(isList(before) ? before : [])].slice(0, KEPT));
    });
    cms.routes.add('GET', '/log', async () => {
      const log = await cms.store.get('log');
      return { items: isList(log) ? log : [] };
    });
  },
});
