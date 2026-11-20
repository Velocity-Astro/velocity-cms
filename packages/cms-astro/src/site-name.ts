import { isLiveType, siteNameFrom, type Cms } from '@velocity-astro/cms-core';
import { DEFAULT_LOCALE, entriesOf } from './link.js';

/**
 * What the site is called, when nothing fixes it: the name published on the page of the settings
 * that holds it (a template's "Business details"), then what an owner saved under Settings,
 * General. `null` when neither says, so the name from the site's code stands. One field names
 * the site for its visitors, its editor and its emails.
 */
export async function siteNameNow(cms: Cms): Promise<string | null> {
  const type = (await cms.schema.list()).find((candidate) => isLiveType(candidate) && candidate.siteNamePath !== undefined);
  if (type) {
    const published = (await entriesOf(cms, type)).filter((entry) => entry.published !== undefined);
    // The first language's name is the site's: an email is not written in a visitor's language.
    const entry = published.find((candidate) => candidate.locale === DEFAULT_LOCALE) ?? published[0];
    const name = entry?.published ? siteNameFrom(type, entry.published.data) : null;
    if (name !== null) return name;
  }
  return cms.settings.siteName();
}
