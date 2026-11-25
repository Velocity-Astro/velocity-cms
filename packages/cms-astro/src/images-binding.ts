import { IMAGE_LONGEST_SIDE, type ImageOptimizer } from '@velocity-astro/cms-core';
import { workerBinding } from './d1-binding.js';

/** The part of Cloudflare's Images binding this uses. */
interface ImageWork {
  transform(options: { width?: number; height?: number; fit?: 'scale-down' | 'contain' }): ImageWork;
  output(options: { format: 'image/webp' | 'image/png'; quality?: number }): Promise<{ response(): Response }>;
}
export interface ImagesBinding {
  info(stream: ReadableStream<Uint8Array>): Promise<{ format: string; width?: number; height?: number }>;
  input(stream: ReadableStream<Uint8Array>): ImageWork;
}

/** The same qualities the sharp optimizer packs at, so an image looks alike wherever the site runs. */
const PHOTO_QUALITY = 80;
const DRAWING_QUALITY = 90;

/** What this makes lighter. A WebP is left as it is: this cannot tell one that moves, which would stop. */
const PACKED_ANEW = new Set(['image/jpeg', 'image/png']);
/** What a small copy is made of. An upload is kept as a WebP, so that is most of them. */
const MADE_SMALLER = new Set(['image/jpeg', 'image/png', 'image/webp']);

const stream = (bytes: Uint8Array): ReadableStream<Uint8Array> => new Blob([Uint8Array.from(bytes)]).stream();

export interface CloudflareImageOptimizerOptions {
  /** The Images binding, asked for when the first image arrives. `null` when the Worker has none. */
  readonly images: () => Promise<ImagesBinding | null>;
  /** Hears, once, that the Worker has no Images binding. Defaults to a line in the log. */
  readonly onUnavailable?: () => void;
}

/**
 * Makes uploads lighter on Cloudflare Workers, where sharp does not run, with the Images binding
 * (`images` in the Wrangler config, which Astro's Cloudflare adapter adds as `IMAGES`).
 *
 * Where the Worker has no such binding, nothing is optimized and nothing breaks: every method
 * answers `null`, which the media service reads as "keep the image as it is".
 */
export class CloudflareImageOptimizer implements ImageOptimizer {
  readonly #options: CloudflareImageOptimizerOptions;
  #images: Promise<ImagesBinding | null> | undefined;

  constructor(options: CloudflareImageOptimizerOptions) {
    this.#options = options;
  }

  /** A photo or a drawing becomes a WebP no longer than a page shows. Never a larger one. */
  async optimize(bytes: Uint8Array): Promise<Uint8Array | null> {
    const images = await this.#binding();
    if (!images) return null;
    const { format } = await images.info(stream(bytes));
    if (!PACKED_ANEW.has(format)) return null;
    const quality = format === 'image/png' ? DRAWING_QUALITY : PHOTO_QUALITY;
    return made(images.input(stream(bytes)).transform({ width: IMAGE_LONGEST_SIDE, height: IMAGE_LONGEST_SIDE, fit: 'scale-down' }).output({ format: 'image/webp', quality }));
  }

  async resize(bytes: Uint8Array, width: number): Promise<Uint8Array | null> {
    const images = await this.#binding();
    if (!images) return null;
    if (!MADE_SMALLER.has((await images.info(stream(bytes))).format)) return null;
    return made(images.input(stream(bytes)).transform({ width, fit: 'scale-down' }).output({ format: 'image/webp', quality: PHOTO_QUALITY }));
  }

  /** The image as a PNG at most `height` pixels tall, for an email. `null` for what the service cannot draw, such as an SVG. */
  async png(bytes: Uint8Array, height: number): Promise<Uint8Array | null> {
    const images = await this.#binding();
    if (!images) return null;
    if (!MADE_SMALLER.has((await images.info(stream(bytes))).format)) return null;
    return made(images.input(stream(bytes)).transform({ height, fit: 'contain' }).output({ format: 'image/png' }));
  }

  #binding(): Promise<ImagesBinding | null> {
    return (this.#images ??= this.#options.images().then((images) => {
      if (!images) (this.#options.onUnavailable ?? unavailable)();
      return images;
    }));
  }
}

async function made(output: Promise<{ response(): Response }>): Promise<Uint8Array> {
  return new Uint8Array(await (await output).response().arrayBuffer());
}

function unavailable(): void {
  console.warn('[velocity-cms] Uploads are kept as they arrive, since this Worker has no Images binding. Add `"images": { "binding": "IMAGES" }` to the Wrangler config to have them made lighter.');
}

/**
 * The optimizer for a site on Cloudflare Workers: the Images binding named `IMAGES`, or the name
 * `VELOCITY_CMS_IMAGES_BINDING` gives.
 */
export function imagesOptimizerFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): CloudflareImageOptimizer {
  const name = env.VELOCITY_CMS_IMAGES_BINDING || 'IMAGES';
  return new CloudflareImageOptimizer({
    images: async () => {
      const found = (await workerBinding(name).catch(() => null))?.binding as Partial<ImagesBinding> | undefined;
      return found && typeof found.input === 'function' && typeof found.info === 'function' ? (found as ImagesBinding) : null;
    },
  });
}
