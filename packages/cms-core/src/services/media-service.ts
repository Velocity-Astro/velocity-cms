import type { AccessControl, Actor } from '../access.js';
import type { SiteImage } from '../model.js';
import type { ImageLibrary } from '../ports.js';

/** What the editor can pick from for an image field. */
export class MediaService {
  constructor(
    private readonly access: AccessControl,
    private readonly library?: ImageLibrary,
  ) {}

  /** The site's images, ordered by name. None when the site has not said where its images are. */
  async images(actor: Actor): Promise<readonly SiteImage[]> {
    this.access.require(actor, 'entry:read');
    if (!this.library) return [];
    return [...(await this.library.list())].sort((a, b) => a.name.localeCompare(b.name));
  }
}
