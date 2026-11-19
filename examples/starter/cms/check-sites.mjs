/**
 * The sites `npm run check:hosted` runs from this one copy, read from what the check wrote into
 * the environment. A real host keeps its sites in a database of its own; the shape is the same:
 * a host name leads to a site with its own database, secret, address and uploads.
 */
import { FolderMediaStore } from '@velocity-astro/cms-astro';

const sites = new Map(
  JSON.parse(process.env.CMS_CHECK_SITES ?? '[]').map(({ host, media, ...site }) => [host, { ...site, media: new FolderMediaStore(media) }]),
);

export default { find: (host) => sites.get(host) ?? null };
