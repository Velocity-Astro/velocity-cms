import { ValidationError, definePlugin, hasOwnPages, liveFields, type ContentTypeDef, type Entry, type PageHead, type PluginContext } from '@velocity-astro/cms-core';
import { analyse, type SeoConfig, type SeoOverrides } from './analyse.js';
import { seoEditor, type SeoFinding } from './editor.js';

/** What search engines show before they cut a title or a description short, near enough. */
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 160;
/** The keys a description field usually has, when the owner names none. */
const DESCRIPTION_KEYS = ['description', 'summary', 'excerpt', 'intro'];
/** How many entries of one type the review reads. More than this and the list says so by its count. */
const REVIEWED_PER_TYPE = 500;

const textOf = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Where what was written for one entry is kept in the plugin's store. */
const WRITTEN = 'written:';
const LONGEST_TITLE = 200;
const LONGEST_DESCRIPTION = 500;

/** What is kept for an entry, read back with nothing taken on trust. */
function writtenOf(stored: unknown): SeoOverrides {
  if (typeof stored !== 'object' || stored === null) return {};
  const { title, description, hidden } = stored as Record<string, unknown>;
  return { ...(textOf(title) !== '' && { title: textOf(title) }), ...(textOf(description) !== '' && { description: textOf(description) }), ...(hidden === true && { hidden: true }) };
}

/** Checks what the editor sent for an entry, and says which part is wrong. */
function checked(body: unknown): SeoOverrides {
  const given = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const issues = [
    ...(given['title'] !== undefined && typeof given['title'] !== 'string' ? [{ path: ['title'], message: 'The search title must be text.' }] : []),
    ...(textOf(given['title']).length > LONGEST_TITLE ? [{ path: ['title'], message: `The search title can be at most ${LONGEST_TITLE} characters.` }] : []),
    ...(given['description'] !== undefined && typeof given['description'] !== 'string' ? [{ path: ['description'], message: 'The search description must be text.' }] : []),
    ...(textOf(given['description']).length > LONGEST_DESCRIPTION ? [{ path: ['description'], message: `The search description can be at most ${LONGEST_DESCRIPTION} characters.` }] : []),
    ...(given['hidden'] !== undefined && typeof given['hidden'] !== 'boolean' ? [{ path: ['hidden'], message: 'Hiding from search engines is a yes or a no.' }] : []),
  ];
  if (issues.length > 0) throw new ValidationError(`This could not be saved: ${issues[0]?.message ?? ''}`, issues);
  return writtenOf(given);
}

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

/** What the owner set for the whole site: the codes search engines ask for, and the share image for a page with none. */
async function siteWideOf(cms: PluginContext, head: PageHead): Promise<PageHead> {
  const set = await cms.settings.get();
  const google = textOf(set['googleVerification']);
  const bing = textOf(set['bingVerification']);
  const image = textOf(set['shareImage']);
  return {
    ...((google !== '' || bing !== '') && { verification: { ...(google !== '' && { google }), ...(bing !== '' && { bing }) } }),
    ...(image !== '' && head.image === undefined && { image }),
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
  description: { en: 'Titles and descriptions for search engines: write them per entry with a live preview, review the whole site, and check before publishing. Also the site\'s share image and its Search Console and Bing codes.' },
  version: '1.2.0',
  permissions: ['entry:read'],
  // It comes with the CMS, so it waits for an owner to activate it.
  enabledByDefault: false,
  settings: [
    {
      key: 'titleSuffix',
      type: 'text',
      label: { en: 'Title ending' },
      help: { en: 'Put after the title of every entry\'s page in place of the site\'s own ending, such as " | Lakeshore Realty". Leave empty to keep the site\'s.' },
    },
    {
      key: 'descriptionField',
      type: 'text',
      label: { en: 'Description field' },
      help: { en: 'The key of the field that holds a page\'s description. Leave empty to use "description", "summary", "excerpt" or "intro", whichever a content type has.' },
    },
    { key: 'maxDescription', type: 'number', label: { en: 'Longest description' }, help: { en: 'In characters. Search engines cut longer ones short. Leave empty for 160.' }, options: { min: 50, integer: true } },
    { key: 'requireDescription', type: 'boolean', label: { en: 'Require a description before publishing' } },
    {
      key: 'shareImage',
      type: 'image',
      label: { en: 'Share image' },
      help: { en: 'Shown where a page is shared, when the page has no picture of its own. Leave empty to keep what the site draws.' },
    },
    {
      key: 'googleVerification',
      type: 'text',
      label: { en: 'Google Search Console code' },
      help: { en: 'From Search Console, "HTML tag": only what is inside content="…". Every page then carries it, so Google knows the site is yours.' },
      options: { maxLength: 200 },
    },
    {
      key: 'bingVerification',
      type: 'text',
      label: { en: 'Bing Webmaster Tools code' },
      help: { en: 'From Bing Webmaster Tools, "HTML Meta Tag": only what is inside content="…".' },
      options: { maxLength: 200 },
    },
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
      // One written for search engines counts.
      if (writtenOf(await cms.store.get(`${WRITTEN}${entry.id}`)).description !== undefined) return [];
      return [{ path: [field.key], message: 'Write a description before publishing. Search engines show it under the page\'s title.' }];
    });

    cms.routes.add('GET', '/config', () => configOf(cms));

    // What the page of an entry says about itself: what was written for it here, and the
    // owner's title ending. A page that is not an entry's own is left as the template made it.
    // Every page, an entry's or not, carries the site's codes and, when it has no picture of its own, the share image.
    cms.pages.head(async ({ entry }, head) => {
      const site = await siteWideOf(cms, head);
      if (!entry) return site;
      const written = writtenOf(await cms.store.get(`${WRITTEN}${entry.id}`));
      const { titleSuffix } = await configOf(cms);
      const title = written.title ?? head.title;
      return {
        ...site,
        ...(written.title !== undefined && { title: written.title }),
        ...(titleSuffix !== '' && title !== undefined && { fullTitle: `${title}${titleSuffix}` }),
        ...(written.description !== undefined && { description: written.description }),
        ...(written.hidden === true && { noindex: true }),
      };
    });

    cms.routes.add('GET', '/entries/:id', async ({ actor, params }) => {
      // Asked as the person, so what is written for an entry is shown only to someone who may open it.
      const entry = await cms.content.get(actor, params['id'] ?? '');
      return writtenOf(await cms.store.get(`${WRITTEN}${entry.id}`));
    });

    // It shows on the live page at once, with no draft, so it takes someone who may publish.
    cms.routes.add(
      'PUT',
      '/entries/:id',
      async ({ actor, params, body }) => {
        const entry = await cms.content.get(actor, params['id'] ?? '');
        const written = checked(body);
        if (Object.keys(written).length === 0) await cms.store.remove(`${WRITTEN}${entry.id}`);
        else await cms.store.set(`${WRITTEN}${entry.id}`, written);
        await cms.pages.changed();
        return written;
      },
      { requires: 'entry:publish' },
    );

    // Read as the person who asked, so nobody is shown an entry they could not open.
    cms.routes.add('GET', '/review', async ({ actor }) => {
      const config = await configOf(cms);
      const items: SeoFinding[] = [];
      const written = await cms.store.list(WRITTEN);
      let checked = 0;
      // Only what has a page of its own is found by a search engine: menus and settings are left out.
      for (const type of (await cms.schema.list()).filter(hasOwnPages)) {
        const { items: entries } = await cms.content.find(actor, { typeId: type.id, order: 'updated', limit: REVIEWED_PER_TYPE });
        for (const entry of entries) {
          checked += 1;
          const { problems } = analyse(type, entry.data, config, writtenOf(written[`${WRITTEN}${entry.id}`]));
          if (problems.length > 0) items.push({ id: entry.id, typeKey: type.key, typeLabel: type.label['en'] ?? type.key, name: nameOf(type, entry), status: entry.status, problems });
        }
      }
      return { items, checked };
    });
  },
});
