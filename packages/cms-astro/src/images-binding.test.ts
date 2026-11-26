import { describe, expect, it } from 'vitest';
import { IMAGE_LONGEST_SIDE } from '@velocity-astro/cms-core';
import { CloudflareImageOptimizer, type ImagesBinding } from './images-binding.js';

/** A stand-in for the Images binding: it says what it was asked, and answers with bytes that name it. */
function fakeImages(format: string) {
  const asked: Array<{ transform: unknown; output: unknown }> = [];
  const binding: ImagesBinding = {
    info: async () => ({ format, width: 4000, height: 3000 }),
    input: () => {
      let transform: unknown;
      const work = {
        transform: (options: unknown) => {
          transform = options;
          return work;
        },
        output: async (options: unknown) => {
          asked.push({ transform, output: options });
          return { response: () => new Response(Uint8Array.from([1, 2, 3])) };
        },
      };
      return work;
    },
  };
  return { binding, asked };
}
const bytes = Uint8Array.from([9, 9, 9]);
const optimizer = (format: string) => {
  const images = fakeImages(format);
  return { ...images, optimizer: new CloudflareImageOptimizer({ images: async () => images.binding }) };
};

describe('CloudflareImageOptimizer', () => {
  it('packs a photo as a WebP no longer than a page shows, and never enlarges', async () => {
    const { optimizer: made, asked } = optimizer('image/jpeg');
    expect([...((await made.optimize(bytes)) ?? [])]).toEqual([1, 2, 3]);
    expect(asked).toEqual([{ transform: { width: IMAGE_LONGEST_SIDE, height: IMAGE_LONGEST_SIDE, fit: 'scale-down' }, output: { format: 'image/webp', quality: 80 } }]);
  });

  it('packs a drawing more closely than a photo', async () => {
    const { optimizer: made, asked } = optimizer('image/png');
    await made.optimize(bytes);
    expect(asked[0]?.output).toEqual({ format: 'image/webp', quality: 90 });
  });

  it('leaves a WebP as it is, since one that moves would stop', async () => {
    const { optimizer: made, asked } = optimizer('image/webp');
    expect(await made.optimize(bytes)).toBeNull();
    expect(asked).toEqual([]);
  });

  it('makes a small copy of what an upload is kept as', async () => {
    const { optimizer: made, asked } = optimizer('image/webp');
    expect(await made.resize(bytes, 640)).not.toBeNull();
    expect(asked).toEqual([{ transform: { width: 640, fit: 'scale-down' }, output: { format: 'image/webp', quality: 80 } }]);
  });

  it('draws a PNG for an email, and nothing from what it cannot read', async () => {
    const { optimizer: made, asked } = optimizer('image/png');
    expect(await made.png(bytes, 96)).not.toBeNull();
    expect(asked[0]).toEqual({ transform: { height: 96, fit: 'contain' }, output: { format: 'image/png' } });
    expect(await optimizer('image/svg+xml').optimizer.png(bytes, 96)).toBeNull();
  });

  it('keeps every image as it arrived on a Worker with no Images binding, and says so once', async () => {
    let heard = 0;
    const without = new CloudflareImageOptimizer({ images: async () => null, onUnavailable: () => (heard += 1) });
    expect(await without.optimize(bytes)).toBeNull();
    expect(await without.resize(bytes, 640)).toBeNull();
    expect(await without.png(bytes, 96)).toBeNull();
    expect(heard).toBe(1);
  });
});
