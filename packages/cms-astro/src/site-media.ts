import { NotFoundError, type SiteImage } from '@velocity-astro/cms-core';
import { sharedConnection, SITE } from './connection.js';
import { siteKey } from './hosted.js';

/**
 * The answer to a request for an uploaded file. A file never changes once it is kept and its
 * name is never given to another, so browsers and the CDN may keep it for good.
 *
 * With a width (`/media/kitchen.webp?w=640`, one of `IMAGE_WIDTHS`) the answer is a copy no
 * wider than that. It is made when asked for and kept by the browser and the CDN like the
 * image itself, so a width is made once.
 */
export async function uploadedFile(key: string, width?: string | null): Promise<Response> {
  const { cms } = await sharedConnection({});
  try {
    // `?w=640` asks for a small copy. Anything that is not a whole number is no width at all.
    if (width != null && !/^[1-9]\d{2,3}$/.test(width)) throw new NotFoundError('Image', key);
    const file = await cms.media.file(key, width == null ? undefined : Number(width));
    return new Response(file.bytes, {
      headers: {
        'content-type': file.contentType,
        'content-length': String(file.bytes.length),
        'cache-control': 'public, max-age=31536000, immutable',
        // The file is shown as the image it was checked to be, and as nothing else.
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
    throw error;
  }
}

/** The uploaded images of each site this server draws pages for. */
const latest = new Map<string, ReadonlyMap<string, SiteImage>>();

/**
 * Reads the uploaded images again. The site's middleware does this before each page is
 * rendered, so a page never misses an image that was uploaded a moment ago, whichever server
 * renders it.
 */
export async function refreshUploadedImages(): Promise<void> {
  const { cms } = await sharedConnection({});
  latest.set(siteKey(), new Map((await cms.media.uploads(SITE)).map((image) => [image.name, image])));
}

/**
 * The uploaded image with this name, as it was when the page began to render: its address on
 * this site and its size. `undefined` when no upload has the name.
 */
export const uploadedImage = (name: string): SiteImage | undefined => latest.get(siteKey())?.get(name);
