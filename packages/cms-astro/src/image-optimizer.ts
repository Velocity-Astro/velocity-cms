import type sharp from 'sharp';
import { IMAGE_LONGEST_SIDE, type ImageOptimizer } from '@velocity-astro/cms-core';

/** Only its type is named here: the library itself is loaded when the first image arrives. */
type Sharp = typeof sharp;

/** How closely a photo is kept: past this nobody sees the difference, and the file only grows. */
const PHOTO_QUALITY = 80;
/** A PNG is often a drawing with sharp edges, which show a loss sooner than a photo does. */
const DRAWING_QUALITY = 90;
/** How hard the encoder works, from 0 to 6. Four is where more time stops buying much. */
const EFFORT = 4;
/** The most pixels an image is opened with: the service refuses a longer side than 12,000 itself. */
const MAX_PIXELS = 12_000 * 12_000;

export interface SharpImageOptimizerOptions {
  /** Loads the library. Defaults to the `sharp` package, which comes with Astro. */
  readonly load?: () => Promise<Sharp>;
  /** Hears, once, that the library could not be loaded. Defaults to a line in the server's log. */
  readonly onUnavailable?: (error: unknown) => void;
}

/**
 * Makes uploads lighter with sharp, the library Astro itself resizes images with. It runs
 * wherever Node does: a server of your own, and the functions of hosts such as Vercel.
 *
 * Where it cannot be loaded (a runtime that is not Node, or a machine it has no build for),
 * nothing is optimized and nothing breaks: every method answers `null`, which the media
 * service reads as "keep the image as it is".
 */
export class SharpImageOptimizer implements ImageOptimizer {
  readonly #options: SharpImageOptimizerOptions;
  #sharp: Promise<Sharp | null> | undefined;

  constructor(options: SharpImageOptimizerOptions = {}) {
    this.#options = options;
  }

  /**
   * A photo becomes a WebP at a quality nobody tells from the original. A PNG is tried both
   * ways, exact and nearly exact, and the lighter is kept: a logo or a screenshot packs best
   * exactly and stays crisp, a photo saved as a PNG packs best the other way. See-through
   * parts stay see-through.
   *
   * A WebP that already fits is left alone, since packing it again would only wear it, and so
   * is one that moves, which would stop.
   */
  async optimize(bytes: Uint8Array): Promise<Uint8Array | null> {
    const library = await this.#library();
    if (!library) return null;
    const open = () => library(bytes, { limitInputPixels: MAX_PIXELS });
    const facts = await open().metadata();
    if ((facts.pages ?? 1) > 1) return null;
    const turned = (facts.orientation ?? 1) > 1;
    const fits = Math.max(facts.width, facts.height) <= IMAGE_LONGEST_SIDE;
    if (facts.format === 'webp' && fits && !turned) return null;

    // Turned the way it was taken first, since what the camera noted about that is not kept.
    const ready = () => open().rotate().resize({ width: IMAGE_LONGEST_SIDE, height: IMAGE_LONGEST_SIDE, fit: 'inside', withoutEnlargement: true });
    if (facts.format !== 'png') return ready().webp({ quality: PHOTO_QUALITY, effort: EFFORT }).toBuffer();
    const [exact, close] = await Promise.all([
      ready().webp({ lossless: true, effort: EFFORT }).toBuffer(),
      ready().webp({ quality: DRAWING_QUALITY, effort: EFFORT }).toBuffer(),
    ]);
    return exact.length <= close.length ? exact : close;
  }

  async resize(bytes: Uint8Array, width: number): Promise<Uint8Array | null> {
    const library = await this.#library();
    if (!library) return null;
    const open = () => library(bytes, { limitInputPixels: MAX_PIXELS });
    if (((await open().metadata()).pages ?? 1) > 1) return null;
    return open().rotate().resize({ width, withoutEnlargement: true }).webp({ quality: PHOTO_QUALITY, effort: EFFORT }).toBuffer();
  }

  /** The library, loaded the first time an image arrives, or `null` on a machine that has none. */
  #library(): Promise<Sharp | null> {
    const load = this.#options.load ?? (async (): Promise<Sharp> => (await import('sharp')).default);
    return (this.#sharp ??= load().catch((error: unknown) => {
      (this.#options.onUnavailable ?? unavailable)(error);
      return null;
    }));
  }
}

function unavailable(error: unknown): void {
  console.warn('[velocity-cms] Uploads are kept as they arrive, since the image library "sharp" could not be loaded. Install it (`npm install sharp`) to have them made lighter.', error);
}
