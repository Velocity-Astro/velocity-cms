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
  /**
   * The picture shown where the page is shared: the value of an image field, or an address on
   * the site (`/share.png`) or on the web (`https://…`). The template turns it into an address
   * as it does any picture.
   */
  readonly image?: string;
  /** The codes search engines ask a site to show to prove it is its owner's. */
  readonly verification?: PageVerification;
  /** How the site is measured, for the template to write the measuring tags it already has. */
  readonly analytics?: PageAnalytics;
}

/** The codes of the tags that prove to a search engine who owns the site. */
export interface PageVerification {
  /** The content of `<meta name="google-site-verification">`. */
  readonly google?: string;
  /** The content of `<meta name="msvalidate.01">`. */
  readonly bing?: string;
}

/** How visitors may be asked before they are measured. */
export const CONSENT_MODES = ['opt_out', 'consent_mode_v2', 'strict'] as const;
export type ConsentMode = (typeof CONSENT_MODES)[number];

/** What the site is measured with. Each is an id, never a script: the template writes the tags. */
export interface PageAnalytics {
  /** A Google Analytics measurement id, `G-…`. */
  readonly googleAnalytics?: string;
  /** A Google Tag Manager container id, `GTM-…`. */
  readonly tagManager?: string;
  /**
   * Whether visitors are asked first, and how: on until they say no (`opt_out`), off until they say
   * yes with Google's cookieless pings (`consent_mode_v2`), or off until they say yes (`strict`).
   * Left out, nobody is asked.
   */
  readonly consent?: ConsentMode;
  /** Where the consent banner's privacy link leads: a path on the site or an `https` address. */
  readonly privacyUrl?: string;
}

/** A plain id of a tag: letters, digits, dashes and underscores. */
const TAG_CODE = /^[A-Za-z0-9_-]{1,200}$/;
const GA_ID = /^G-[A-Z0-9]{4,20}$/;
const GTM_ID = /^GTM-[A-Z0-9]{4,20}$/;

/** An address on this site (`/…`, never `//…`) or on the web over `https`, with nothing that could leave an attribute. */
export function isPageAddress(value: string): boolean {
  if (/[\s"'<>`]/.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
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
  const image = typeof given['image'] === 'string' ? given['image'].trim() : '';
  return {
    ...text('title'),
    ...text('fullTitle'),
    ...text('description'),
    ...(typeof given['noindex'] === 'boolean' && { noindex: given['noindex'] }),
    // An image field's value is a name or a key with no spaces; an address must be one a page can hold.
    ...(image !== '' && image.length <= LONGEST && (isPageAddress(image) || /^[A-Za-z0-9._/-]+$/.test(image)) && { image }),
    ...verificationOf(given['verification']),
    ...analyticsOf(given['analytics']),
  };
}

const recordOf = (value: unknown): Record<string, unknown> | undefined => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined);
const matching = (value: unknown, pattern: RegExp): string | undefined => (typeof value === 'string' && pattern.test(value.trim()) ? value.trim() : undefined);

function verificationOf(value: unknown): { verification?: PageVerification } {
  const given = recordOf(value);
  if (!given) return {};
  const google = matching(given['google'], TAG_CODE);
  const bing = matching(given['bing'], TAG_CODE);
  return google === undefined && bing === undefined ? {} : { verification: { ...(google !== undefined && { google }), ...(bing !== undefined && { bing }) } };
}

function analyticsOf(value: unknown): { analytics?: PageAnalytics } {
  const given = recordOf(value);
  if (!given) return {};
  const googleAnalytics = matching(given['googleAnalytics'], GA_ID);
  const tagManager = matching(given['tagManager'], GTM_ID);
  const consent = CONSENT_MODES.find((mode) => mode === given['consent']);
  const privacy = typeof given['privacyUrl'] === 'string' ? given['privacyUrl'].trim() : '';
  const privacyUrl = privacy !== '' && privacy.length <= LONGEST && isPageAddress(privacy) ? privacy : undefined;
  const analytics: PageAnalytics = {
    ...(googleAnalytics !== undefined && { googleAnalytics }),
    ...(tagManager !== undefined && { tagManager }),
    ...(consent !== undefined && { consent }),
    ...(privacyUrl !== undefined && { privacyUrl }),
  };
  return Object.keys(analytics).length === 0 ? {} : { analytics };
}

/** Where an address that has no page sends a visitor. */
export interface PageRedirect {
  /** A path on the site (`/new-place/`) or an `https` address. */
  readonly to: string;
  /** A move for good (308), which search engines follow, or for now (307). */
  readonly permanent: boolean;
}

/** Says where a visitor to an address that has no page should go, or nothing. */
export type PageRedirectRule = (path: string) => PageRedirect | undefined | Promise<PageRedirect | undefined>;

/** Only a redirect to a page's own kind of address, never to the address it came from. */
function redirectTaken(change: unknown, from: string): PageRedirect | undefined {
  const given = recordOf(change);
  const to = typeof given?.['to'] === 'string' ? given['to'].trim() : '';
  if (to === '' || to.length > LONGEST || !isPageAddress(to)) return undefined;
  if (to.replace(/\/+$/, '') === from.replace(/\/+$/, '')) return undefined;
  return { to, permanent: given?.['permanent'] !== false };
}

/** The rules that shape a page's head, in the order they were added. */
export class PageHeads {
  readonly #rules = new Set<PageHeadRule>();
  readonly #redirects = new Set<PageRedirectRule>();

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

  /** Adds a rule that sends visitors from an address with no page. Returns a function that takes it away again. */
  addRedirect(rule: PageRedirectRule): () => void {
    this.#redirects.add(rule);
    return () => this.#redirects.delete(rule);
  }

  /** Where a visitor to `path`, which has no page, should be sent: the first rule's answer that is a fit address. */
  async redirect(path: string): Promise<PageRedirect | undefined> {
    for (const rule of this.#redirects) {
      const found = redirectTaken(await rule(path), path);
      if (found) return found;
    }
    return undefined;
  }
}
