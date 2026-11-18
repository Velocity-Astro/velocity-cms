import { definePlugin, liveFields, type ContentTypeDef, type Entry, type PluginContext } from '@velocity/cms-core';
import { analyse, type SeoConfig } from './analyse.js';
import { seoEditor, type SeoFinding } from './editor.js';

/** What search engines show before they cut a title or a description short, near enough. */
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 160;
/** The keys a description field usually has, when the owner names none. */
const DESCRIPTION_KEYS = ['description', 'summary', 'excerpt', 'intro'];
/** How many entries of one type the review reads. More than this and the list says so by its count. */
const REVIEWED_PER_TYPE = 500;

const textOf = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** The owner's settings, with what the plugin goes by where one is left empty. */
async function configOf(cms: PluginContext): Promise<SeoConfig> {
  const set = await cms.settings.get();
  const key = textOf(set['descriptionField']);
  const longest = set['maxDescription'];
  return {
    titleSuffix: typeof set['titleSuffix'] === 'string' ? set['titleSuffix'] : '',
    descriptionKeys: key === '' ? DESCRIPTION_KEYS : [key],
    maxTitle: MAX_TITLE,
    maxDescription: typeof longest === 'number' && longest > 0 ? longest : MAX_DESCRIPTION,
    requireDescription: set['requireDescription'] === true,
  };
}

/** An entry's name for a list: its title, or its slug when it has none yet. */
function nameOf(type: ContentTypeDef, entry: Entry): string {
  const fields = liveFields(type.fields);
  const field = fields.find((candidate) => candidate.id === type.titlePath?.[0]) ?? fields.find((candidate) => candidate.type === 'text');
  return textOf(field ? entry.data[field.id] : undefined) || entry.slug;
}

/**
 * SEO: how each entry will read in search results. It shows a preview beside every entry, lists
 * the entries that still need a title or a description, and can hold a publish back until the
 * description is written. Built on the plugin surface alone, as any plugin is.
 */
export const seo = definePlugin({
  name: 'seo',
  apiVersion: 1,
  label: { en: 'SEO' },
  description: { en: 'A search preview beside every entry, a review of titles and descriptions, and a check before publishing.' },
  version: '1.0.0',
  permissions: ['entry:read'],
  // It comes with the CMS, so it waits for an owner to activate it.
  enabledByDefault: false,
  settings: [
    { key: 'titleSuffix', type: 'text', label: { en: 'Title ending' }, help: { en: 'Added to every page title in the preview, such as " | Lakeshore Realty". Leave empty for none.' } },
    {
      key: 'descriptionField',
      type: 'text',
      label: { en: 'Description field' },
      help: { en: 'The key of the field that holds a page\'s description. Leave empty to use "description", "summary", "excerpt" or "intro", whichever a content type has.' },
    },
    { key: 'maxDescription', type: 'number', label: { en: 'Longest description' }, help: { en: 'In characters. Search engines cut longer ones short. Leave empty for 160.' }, options: { min: 50, integer: true } },
    { key: 'requireDescription', type: 'boolean', label: { en: 'Require a description before publishing' } },
  ],
  // Two functions that stand alone, sent as the text of one module: the editor's part, and the
  // analysis it shares with the server, so both always judge an entry the same way.
  editor: `const analyse = ${analyse.toString()};\nconst editor = ${seoEditor.toString()};\nexport default (api) => editor(api, analyse);\n`,
  setup(cms) {
    cms.checks.add('publish', async ({ entry, type }) => {
      const config = await configOf(cms);
      if (!config.requireDescription) return [];
      const fields = liveFields(type.fields);
      const field = config.descriptionKeys.map((key) => fields.find((candidate) => candidate.key === key && candidate.type === 'text')).find((candidate) => candidate !== undefined);
      // A type with no description field has nothing to fill in.
      if (!field || textOf(entry.data[field.key]) !== '') return [];
      return [{ path: [field.key], message: 'Write a description before publishing. Search engines show it under the page\'s title.' }];
    });

    cms.routes.add('GET', '/config', () => configOf(cms));

    // Read as the person who asked, so nobody is shown an entry they could not open.
    cms.routes.add('GET', '/review', async ({ actor }) => {
      const config = await configOf(cms);
      const items: SeoFinding[] = [];
      let checked = 0;
      for (const type of await cms.schema.list()) {
        const { items: entries } = await cms.content.find(actor, { typeId: type.id, order: 'updated', limit: REVIEWED_PER_TYPE });
        for (const entry of entries) {
          checked += 1;
          const { problems } = analyse(type, entry.data, config);
          if (problems.length > 0) items.push({ id: entry.id, typeKey: type.key, typeLabel: type.label['en'] ?? type.key, name: nameOf(type, entry), status: entry.status, problems });
        }
      }
      return { items, checked };
    });
  },
});
