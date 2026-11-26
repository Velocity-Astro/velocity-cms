import type { Cms } from '@velocity-astro/cms-core';
import { sharedConnection } from './connection.js';
import { DEFAULT_LOCALE, entriesOf } from './link.js';
import type { DrawnPage } from './page-head.js';
import { isPreview, withPreviewDraft } from './preview.js';
import { withRichText } from './rich-text.js';

/** `single` for a CMS already at hand. `preview` reads the version being worked on. */
export async function singleFrom(cms: Cms, locale: string, type: string, preview = false): Promise<Readonly<Record<string, unknown>> | undefined> {
  const holder = (await cms.schema.list()).find((candidate) => candidate.key === type);
  if (!holder || holder.kind !== 'single') return undefined;
  const shown = (await entriesOf(cms, holder)).filter((entry) => preview || entry.published !== undefined);
  // What a site says about itself (its name, its phone number) holds in every language, so a
  // language with no entry of its own reads the first language's instead of going without.
  const entry = shown.find((candidate) => candidate.locale === locale) ?? shown.find((candidate) => candidate.locale === DEFAULT_LOCALE) ?? shown[0];
  return entry && withRichText(cms, cms.content.toPublic(holder, withPreviewDraft(entry), preview ? 'working' : 'published').data, locale, preview);
}

/**
 * What a single page of the CMS holds, by field key, for the page being drawn: the site's
 * settings, say, which every page reads.
 *
 * ```astro
 * const settings = await single(Astro, 'settings');
 * ```
 *
 * The entry in the page's language is read, and the first language's when that language has
 * none. It answers with nothing when there is no such type, when nothing is published yet, and
 * when anything goes wrong: a page is never lost over it, and the template uses its own values.
 */
export async function single(page: DrawnPage, type: string): Promise<Readonly<Record<string, unknown>> | undefined> {
  try {
    const { cms } = await sharedConnection({});
    return await singleFrom(cms, page.currentLocale ?? DEFAULT_LOCALE, type, isPreview());
  } catch (error) {
    console.error(`[velocity-cms] "${type}" could not be read, so the template's own values are used.`, error instanceof Error ? error.message : error);
    return undefined;
  }
}
