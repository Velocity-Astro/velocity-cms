import { timingSafeEqual } from 'node:crypto';
import { currentSite, isHosted } from './hosted.js';

/**
 * The site's one secret: from `VELOCITY_CMS_SECRET`, or the site's own on a server that runs many. It signs preview links and, until the editor
 * exists, proves that a publish notice comes from the site's owner. Without it both are off.
 */
export const siteSecret = (): string | undefined => (isHosted() ? currentSite()?.secret : process.env.VELOCITY_CMS_SECRET || undefined);

/** Whether the request carries the secret as a bearer token. */
export function hasSiteSecret(request: Request): boolean {
  const secret = siteSecret();
  const given = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!secret || !given) return false;
  const [a, b] = [Buffer.from(secret), Buffer.from(given)];
  return a.length === b.length && timingSafeEqual(a, b);
}
