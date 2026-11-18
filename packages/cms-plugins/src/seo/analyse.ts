import type { ContentTypeDef } from '@velocity/cms-core';

/** What the SEO plugin goes by, from its settings. */
export interface SeoConfig {
  /** Added to every page title, such as " | Lakeshore Realty". */
  readonly titleSuffix: string;
  /** The keys a description field may have, most wanted first. */
  readonly descriptionKeys: readonly string[];
  readonly maxTitle: number;
  readonly maxDescription: number;
  readonly requireDescription: boolean;
}

/** What an owner or editor wrote for search engines in place of an entry's own title and description. */
export interface SeoOverrides {
  readonly title?: string;
  readonly description?: string;
  /** Asks search engines to leave the page out. */
  readonly hidden?: boolean;
}

export type SeoProblem = 'no-title' | 'long-title' | 'no-description' | 'long-description';

export interface SeoAnalysis {
  /** The title as a search engine would show it, ending included. Empty when the entry has none. */
  readonly title: string;
  readonly description: string;
  /** The key of the field the description comes from, or `null` when the type has no such field. */
  readonly descriptionKey: string | null;
  /** The entry's own title and description, which show when nothing is written in their place. */
  readonly ownTitle: string;
  readonly ownDescription: string;
  readonly problems: readonly SeoProblem[];
}

/**
 * How one entry will read in search results. `data` is the entry's values by field id, as they
 * are stored and as the editor's form holds them. `written` is what was written for search
 * engines in their place, if anything.
 *
 * This function is also sent to the browser as text (see `plugin.ts`), so it must stand alone:
 * it may use nothing but its arguments.
 */
export function analyse(type: ContentTypeDef, data: Readonly<Record<string, unknown>>, config: SeoConfig, written: SeoOverrides = {}): SeoAnalysis {
  const fields = type.fields.filter((field) => field.deletedAt === undefined);
  const text = (id: string | undefined) => {
    const value = id === undefined ? undefined : data[id];
    return typeof value === 'string' ? value.trim() : '';
  };
  const titleField = fields.find((field) => field.id === type.titlePath?.[0]) ?? fields.find((field) => field.type === 'text');
  const descriptionField = config.descriptionKeys.map((key) => fields.find((field) => field.key === key && field.type === 'text')).find((field) => field !== undefined);

  const ownTitle = text(titleField?.id);
  const ownDescription = text(descriptionField?.id);
  const own = (written.title ?? '').trim() || ownTitle;
  const title = own === '' ? '' : `${own}${config.titleSuffix}`;
  const description = (written.description ?? '').trim() || ownDescription;
  const problems: SeoProblem[] = [];
  if (own === '') problems.push('no-title');
  else if (title.length > config.maxTitle) problems.push('long-title');
  // A type with no description field has nothing to fill in, so it is not counted against it.
  if (description === '' && descriptionField) problems.push('no-description');
  else if (description.length > config.maxDescription) problems.push('long-description');
  return { title, description, descriptionKey: descriptionField?.key ?? null, ownTitle, ownDescription, problems };
}
