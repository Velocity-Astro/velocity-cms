import { NotFoundError } from '@velocity-astro/cms-core';
import { sharedConnection, SITE } from './connection.js';
import { siteImageOptimizer } from './site-optimizer.js';

/** Where an email loads the site's images from: one name, as a PNG. */
export const MAIL_IMAGE_PATH = '/cms-mail';
/** How tall a logo is drawn in an email, in pixels. It is made twice that, for sharp screens. */
export const MAIL_LOGO_HEIGHT = 40;

/** The address of one of the site's images as an email loads it. */
export const mailImageUrl = (origin: string, name: string): string => `${origin}${MAIL_IMAGE_PATH}/${encodeURIComponent(name)}.png`;

let optimizer: ReturnType<typeof siteImageOptimizer> | undefined;

const notFound = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
/** What an email client can show as it is, when no PNG can be made. */
const SHOWN_AS_IS = new Set(['image/png', 'image/jpeg', 'image/gif']);

/**
 * One of the site's images (an upload or one the site came with, by the name an image field
 * holds) as a PNG an email can show: Outlook shows no WebP and Gmail no SVG, and a logo is
 * usually one or the other. It is made at twice the height an email draws it, and may be kept
 * by a mail client's proxy for a day. Where no PNG can be made, a PNG, JPEG or GIF is sent as it
 * is, and anything else is not found, so the email shows the site's name instead.
 *
 * @param origin The site's own address, from which an image the site came with is read. Never
 *   one the request chose.
 */
export async function mailImage(file: string, origin: string | null): Promise<Response> {
  if (!file.endsWith('.png')) return notFound();
  const name = decodeURIComponent(file.slice(0, -'.png'.length));
  const { cms } = await sharedConnection({});
  const image = (await cms.media.images(SITE)).find((candidate) => candidate.name === name);
  if (!image) return notFound();

  let bytes: Uint8Array;
  let type: string;
  try {
    if (image.uploadedAt !== undefined) {
      const kept = await cms.media.file(decodeURIComponent(image.url.slice(image.url.lastIndexOf('/') + 1).split('?')[0] ?? ''));
      bytes = kept.bytes;
      type = kept.contentType;
    } else {
      if (origin === null) return notFound();
      const address = new URL(image.url, origin);
      if (address.origin !== origin) return notFound();
      const answer = await fetch(address, { redirect: 'error' });
      if (!answer.ok) return notFound();
      bytes = new Uint8Array(await answer.arrayBuffer());
      type = answer.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    }
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof TypeError) return notFound();
    throw error;
  }

  const png = await (optimizer ??= siteImageOptimizer()).png(bytes, MAIL_LOGO_HEIGHT * 2).catch(() => null);
  if (png === null && !SHOWN_AS_IS.has(type)) return notFound();
  const body = png ?? bytes;
  return new Response(body, {
    headers: {
      'content-type': png === null ? type : 'image/png',
      'content-length': String(body.length),
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
}
