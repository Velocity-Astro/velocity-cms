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

/** What the site's settings say it looks like: the names of its logo images, and its colour. */
export interface SiteBrand {
  readonly logo?: string;
  readonly logoDark?: string;
  /** `#rgb` or `#rrggbb`, as a colour field holds it. */
  readonly color?: string;
}

const valueAt = (data: unknown, path: readonly string[] | undefined): unknown => {
  if (path === undefined) return undefined;
  let value = data;
  for (const id of path) value = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[id] : undefined;
  return value;
};

/**
 * How the site looks, from the page of the settings whose type names its brand fields
 * (`brandFields`), as published in the first language. Empty when nothing names them or nothing
 * is published there yet, so an email is drawn in Velocity's own look. It never throws.
 */
export async function siteBrandNow(cms: Cms): Promise<SiteBrand> {
  try {
    const type = (await cms.schema.list()).find((candidate) => isLiveType(candidate) && candidate.brandPaths !== undefined);
    if (!type?.brandPaths) return {};
    const published = (await entriesOf(cms, type)).filter((entry) => entry.published !== undefined);
    const data = (published.find((candidate) => candidate.locale === DEFAULT_LOCALE) ?? published[0])?.published?.data;
    if (data === undefined) return {};
    const text = (path: readonly string[] | undefined) => {
      const value = valueAt(data, path);
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
    };
    const logo = text(type.brandPaths.logo);
    const logoDark = text(type.brandPaths.logoDark);
    const color = text(type.brandPaths.color);
    return { ...(logo && { logo }), ...(logoDark && { logoDark }), ...(color && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) && { color }) };
  } catch {
    return {};
  }
}
