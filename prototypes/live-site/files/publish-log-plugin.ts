/**
 * A small plugin of the site's own, here to show the shape of one: it notes every publish in
 * the server's log. Named under `plugins` in astro.config.mjs, and listed under Plugins in the editor.
 */
import { definePlugin } from '@velocity/cms-astro';

export default definePlugin({
  name: 'publish-log',
  apiVersion: 1,
  label: { en: 'Publish log' },
  description: { en: 'Notes every publish in the server\'s log.' },
  version: '1.0.0',
  setup(cms) {
    cms.events.on('entry.published', ({ entry, actor }) => {
      console.log(`[publish-log] ${actor.kind} ${actor.id} published "${entry.slug}" (${entry.locale}).`);
    });
  },
});
