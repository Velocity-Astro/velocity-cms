import type { Actor } from '../access.js';
import { ConflictError } from '../errors.js';
import { pageAddress, urlPatternFor } from '../page-address.js';
import type { Clock } from '../ports.js';
import { PREVIEW_PARAMETER, PreviewLinks } from '../preview.js';
import type { ContentService } from './content-service.js';
import type { SchemaService } from './schema-service.js';

export interface PreviewServiceOptions {
  /** The site's secret, which signs the links. Without it there are no previews. */
  readonly secret?: string;
  /** The language whose pages sit at a type's `urlPattern`. Defaults to `en`. */
  readonly defaultLocale?: string;
  /** How long a link works. Defaults to an hour. */
  readonly minutes?: number;
}

export interface PreviewLink {
  /** A path on the site, with the token in it: `/listings/oak-lane/?preview=…`. */
  readonly path: string;
  /** When the link stops working. */
  readonly expiresAt: string;
}

/**
 * Gives a person who may read an entry a link to its page as it is being worked on. The link is
 * a path, never a whole address: whoever asks is already on the site.
 */
export class PreviewService {
  readonly #links: PreviewLinks | null;
  readonly #defaultLocale: string;
  readonly #minutes: number;

  constructor(
    private readonly content: ContentService,
    private readonly schema: SchemaService,
    private readonly clock: Clock,
    options: PreviewServiceOptions = {},
  ) {
    this.#links = options.secret !== undefined ? new PreviewLinks(options.secret, clock) : null;
    this.#defaultLocale = options.defaultLocale ?? 'en';
    this.#minutes = options.minutes ?? 60;
  }

  /** Whether this site makes preview links at all. */
  get isOn(): boolean {
    return this.#links !== null;
  }

  /** A link to the entry's page showing the saved version being worked on. */
  async link(actor: Actor, entryId: string): Promise<PreviewLink> {
    // Reading the entry is the permission check: who may read a draft may preview it.
    const entry = await this.content.get(actor, entryId);
    if (!this.#links) {
      throw new ConflictError('This site has no previews, because it has no secret. Set VELOCITY_CMS_SECRET and deploy again.');
    }
    const type = await this.schema.get(entry.typeId);
    const address = pageAddress(type, entry, this.#defaultLocale);
    if (address === null) {
      throw new ConflictError(
        urlPatternFor(type, entry.locale, this.#defaultLocale) === undefined
          ? `The "${type.key}" type has no page of its own in "${entry.locale}", so there is nothing to preview. Its entries show on other pages once published.`
          : 'This entry has no web address yet. Fill in the field its address comes from, save, and preview again.',
      );
    }
    const token = await this.#links.issue(this.#minutes);
    const expiresAt = new Date(Date.parse(this.clock.now()) + this.#minutes * 60_000).toISOString();
    return { path: `${address}?${PREVIEW_PARAMETER}=${token}`, expiresAt };
  }
}
