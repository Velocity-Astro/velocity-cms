import { NotFoundError, type SiteImage } from '@velocity-astro/cms-core';
import { sharedConnection, SITE } from './connection.js';

/**
 * The answer to a request for an uploaded file. A file never changes once it is kept and its
 * name is never given to another, so browsers and the CDN may keep it for good.
 */
export async function uploadedFile(key: string): Promise<Response> {
  const { cms } = await sharedConnection({});
  try {
    const file = await cms.media.file(key);
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

let latest: ReadonlyMap<string, SiteImage> = new Map();

/**
 * Reads the uploaded images again. The site's middleware does this before each page is
 * rendered, so a page never misses an image that was uploaded a moment ago, whichever server
 * renders it.
 */
export async function refreshUploadedImages(): Promise<void> {
  const { cms } = await sharedConnection({});
  latest = new Map((await cms.media.uploads(SITE)).map((image) => [image.name, image]));
}

/**
 * The uploaded image with this name, as it was when the page began to render: its address on
 * this site and its size. `undefined` when no upload has the name.
 */
export const uploadedImage = (name: string): SiteImage | undefined => latest.get(name);
