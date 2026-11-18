import type { ImageMetadata } from 'astro';
import { uploadedImage } from '@velocity/cms-astro';

const FORMATS: Record<string, ImageMetadata['format']> = { jpg: 'jpg', png: 'png', webp: 'webp' };

/**
 * A photo someone uploaded in the editor, in the shape the site's own photos have, so the same
 * components draw both. `undefined` when no upload has the name.
 *
 * The site's image service fetches an upload by its full address, which is why astro.config.mjs
 * lists the site's own host under `image.domains`. While developing, the address stays relative.
 */
export function uploadedPhoto(name: string | undefined): ImageMetadata | undefined {
  const image = name ? uploadedImage(name) : undefined;
  if (!image?.width || !image.height) return undefined;
  const origin = import.meta.env.DEV ? '' : new URL(import.meta.env.SITE).origin;
  const format = FORMATS[image.url.slice(image.url.lastIndexOf('.') + 1)] ?? 'jpg';
  return { src: `${origin}${image.url}`, width: image.width, height: image.height, format };
}
