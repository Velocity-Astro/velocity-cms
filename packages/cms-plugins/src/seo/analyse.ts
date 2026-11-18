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

export type SeoProblem = 'no-title' | 'long-title' | 'no-description' | 'long-description';

export interface SeoAnalysis {
  /** The title as a search engine would show it, ending included. Empty when the entry has none. */
  readonly title: string;
  readonly description: string;
  /** The key of the field the description comes from, or `null` when the type has no such field. */
  readonly descriptionKey: string | null;
  readonly problems: readonly SeoProblem[];
}

/**
 * How one entry will read in search results. `data` is the entry's values by field id, as they
 * are stored and as the editor's form holds them.
 *
 * This function is also sent to the browser as text (see `plugin.ts`), so it must stand alone:
 * it may use nothing but its arguments.
 */
export function analyse(type: ContentTypeDef, data: Readonly<Record<string, unknown>>, config: SeoConfig): SeoAnalysis {
  const fields = type.fields.filter((field) => field.deletedAt === undefined);
  const text = (id: string | undefined) => {
    const value = id === undefined ? undefined : data[id];
    return typeof value === 'string' ? value.trim() : '';
  };
  const titleField = fields.find((field) => field.id === type.titlePath?.[0]) ?? fields.find((field) => field.type === 'text');
  const descriptionField = config.descriptionKeys.map((key) => fields.find((field) => field.key === key && field.type === 'text')).find((field) => field !== undefined);

  const own = text(titleField?.id);
  const title = own === '' ? '' : `${own}${config.titleSuffix}`;
  const description = text(descriptionField?.id);
  const problems: SeoProblem[] = [];
  if (own === '') problems.push('no-title');
  else if (title.length > config.maxTitle) problems.push('long-title');
  // A type with no description field has nothing to fill in, so it is not counted against it.
  if (descriptionField && description === '') problems.push('no-description');
  else if (description.length > config.maxDescription) problems.push('long-description');
  return { title, description, descriptionKey: descriptionField?.key ?? null, problems };
}
