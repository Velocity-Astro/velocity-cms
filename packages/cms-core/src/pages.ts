import type { ContentTypeDef, PublicEntry } from './model.js';

/** A page of the site as it is being drawn. */
export interface PageInfo {
  /** The page's address on the site, such as `/listings/oak-lane/`. */
  readonly path: string;
  readonly locale: string;
  /** The entry the page is for, with values by field key, when the page is an entry's own. */
  readonly entry?: PublicEntry;
  readonly type?: ContentTypeDef;
}

/**
 * What a page says about itself to search engines and to sites that show a link to it. The
 * template gives what it has, each rule may change it, and the template writes the result.
 */
export interface PageHead {
  /** The page's own title, before the site's name is put after it. */
  readonly title?: string;
  /** The whole title, in place of the page's title and the site's name. */
  readonly fullTitle?: string;
  readonly description?: string;
  /** Asks search engines to leave the page out. */
  readonly noindex?: boolean;
}

/** Changes what a page says about itself. It answers with only what it changes, or with nothing. */
export type PageHeadRule = (page: PageInfo, head: PageHead) => PageHead | undefined | Promise<PageHead | undefined>;

/** The longest a title or a description may be. Far past what any search engine shows. */
const LONGEST = 1000;

/**
 * Only what a head may hold is taken from a rule: plain text, without line breaks, and a yes or
 * no. The template writes these as text, so nothing a rule answers can become markup.
 */
function taken(change: unknown): PageHead {
  if (typeof change !== 'object' || change === null) return {};
  const given = change as Record<string, unknown>;
  const text = (name: string) => {
    const value = given[name];
    return typeof value === 'string' && value.trim() !== '' ? { [name]: value.replace(/\s+/g, ' ').trim().slice(0, LONGEST) } : {};
  };
  return { ...text('title'), ...text('fullTitle'), ...text('description'), ...(typeof given['noindex'] === 'boolean' && { noindex: given['noindex'] }) };
}

/** The rules that shape a page's head, in the order they were added. */
export class PageHeads {
  readonly #rules = new Set<PageHeadRule>();

  /** Adds a rule. Returns a function that takes it away again. */
  add(rule: PageHeadRule): () => void {
    this.#rules.add(rule);
    return () => this.#rules.delete(rule);
  }

  /** The head after every rule has had its say. Each rule sees what the ones before it left. */
  async run(page: PageInfo, head: PageHead): Promise<PageHead> {
    let current = head;
    for (const rule of this.#rules) current = { ...current, ...taken(await rule(page, current)) };
    return current;
  }
}
