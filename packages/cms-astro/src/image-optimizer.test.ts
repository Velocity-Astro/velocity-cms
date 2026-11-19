import sharp, { type Sharp } from 'sharp';
import { describe, expect, it } from 'vitest';
import { AccessControl, EventBus, MediaService, readImage, type Actor } from '@velocity-astro/cms-core';
import { FakeClock, InMemoryMediaRepository, InMemoryMediaStore } from '@velocity-astro/cms-core/testing';
import { SharpImageOptimizer } from './image-optimizer.js';

/** A picture with something in every pixel, as a photo has, so it does not pack to nothing. */
async function photo(width: number, height: number): Promise<Sharp> {
  const noise = Buffer.alloc(width * height * 3);
  for (let at = 0; at < noise.length; at += 1) noise[at] = ((at * 31) % 251 ^ (at >> 7)) & 0xff;
  return sharp(noise, { raw: { width, height, channels: 3 } }).blur(3);
}

/** A drawing: flat colour, hard edges and a part that is see-through. */
const drawing = (width: number, height: number): Sharp =>
  sharp({ create: { width, height, channels: 4, background: { r: 20, g: 90, b: 200, alpha: 0 } } }).composite([
    { input: { create: { width: Math.round(width / 2), height: Math.round(height / 2), channels: 4, background: { r: 250, g: 80, b: 40, alpha: 1 } } }, left: 0, top: 0 },
  ]);

const optimizer = new SharpImageOptimizer();

/** What the optimizer made, in a case where it must make something. */
async function made(answer: Promise<Uint8Array | null>): Promise<Uint8Array> {
  const bytes = await answer;
  if (!bytes) throw new Error('The optimizer kept the image as it was.');
  return bytes;
}

describe('SharpImageOptimizer', () => {
  it('turns a JPEG into a lighter WebP of the same size', async () => {
    const jpeg = await (await photo(1200, 800)).jpeg({ quality: 90 }).toBuffer();
    const lighter = await made(optimizer.optimize(jpeg));
    expect(readImage(lighter)).toEqual({ contentType: 'image/webp', extension: 'webp', width: 1200, height: 800 });
    expect(lighter.length).toBeLessThan(jpeg.length);
  });

  it('makes an image larger than a page shows smaller, and keeps its shape', async () => {
    const jpeg = await (await photo(4000, 3000)).jpeg({ quality: 80 }).toBuffer();
    expect(readImage((await made(optimizer.optimize(jpeg))))).toMatchObject({ width: 2560, height: 1920 });
  });

  it('turns a photo the way it was taken, and keeps nothing the camera noted', async () => {
    // A phone held upright stores the picture on its side and notes that it should be turned.
    const jpeg = await (await photo(800, 600)).withExif({ IFD0: { Make: 'Phone', Copyright: 'somebody' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();
    const upright = await made(optimizer.optimize(jpeg));
    expect(readImage(upright)).toMatchObject({ width: 600, height: 800 });
    const facts = await sharp(upright).metadata();
    expect(facts.exif).toBeUndefined();
    expect(facts.orientation).toBeUndefined();
  });

  it('keeps a drawing exact and its see-through parts see-through', async () => {
    const png = await drawing(600, 400).png().toBuffer();
    const exact = await made(optimizer.optimize(png));
    expect(readImage(exact)).toMatchObject({ contentType: 'image/webp', width: 600, height: 400 });
    const { data } = await sharp(exact).raw().toBuffer({ resolveWithObject: true });
    // The corner that was drawn, to the last bit, and the one that was not.
    expect([...data.subarray(0, 4)]).toEqual([250, 80, 40, 255]);
    expect(data[data.length - 1]).toBe(0);
  });

  it('leaves alone a WebP that fits, and one that moves', async () => {
    const still = await (await photo(800, 600)).webp().toBuffer();
    expect(await optimizer.optimize(still)).toBeNull();
    const frames = await Promise.all([drawing(64, 64), drawing(64, 64).negate()].map((frame) => frame.png().toBuffer()));
    const moving = await sharp(frames, { join: { animated: true } }).webp().toBuffer();
    expect((await sharp(moving).metadata()).pages).toBe(2);
    expect(await optimizer.optimize(moving)).toBeNull();
    expect(await optimizer.resize(moving, 320)).toBeNull();
    // One that is too large is still made smaller.
    const large = await (await photo(3000, 1000)).webp().toBuffer();
    expect(readImage((await made(optimizer.optimize(large))))).toMatchObject({ width: 2560 });
  });

  it('makes a small copy, and never a larger one', async () => {
    const jpeg = await (await photo(1200, 800)).jpeg().toBuffer();
    expect(readImage((await made(optimizer.resize(jpeg, 640))))).toMatchObject({ contentType: 'image/webp', width: 640, height: 427 });
    expect(readImage((await made(optimizer.resize(jpeg, 1920))))).toMatchObject({ width: 1200, height: 800 });
  });

  it('refuses a file that is not what it starts as', async () => {
    const jpeg = await (await photo(400, 300)).jpeg().toBuffer();
    await expect(optimizer.optimize(jpeg.subarray(0, 200))).rejects.toThrow();
  });

  it('does nothing, and says so once, where the library cannot be loaded', async () => {
    const heard: unknown[] = [];
    const without = new SharpImageOptimizer({ load: () => Promise.reject(new Error('no build for this machine')), onUnavailable: (error) => void heard.push(error) });
    const jpeg = await (await photo(400, 300)).jpeg().toBuffer();
    expect(await without.optimize(jpeg)).toBeNull();
    expect(await without.resize(jpeg, 320)).toBeNull();
    expect(heard).toHaveLength(1);
  });

  it('gives the media service what it keeps', async () => {
    const owner: Actor = { kind: 'user', id: 'u1', role: 'owner' };
    const store = new InMemoryMediaStore();
    const media = new MediaService(new AccessControl(), new EventBus(), new FakeClock(), { storage: { files: new InMemoryMediaRepository(), store }, optimizer });
    const jpeg = await (await photo(3000, 2000)).jpeg({ quality: 90 }).toBuffer();
    const image = await media.upload(owner, { fileName: 'Living Room.jpg', bytes: jpeg });
    expect(image).toMatchObject({ name: 'living-room', url: '/media/living-room.webp', width: 2560, height: 1707, thumbnail: '/media/living-room.webp?w=640' });
    expect(image.size).toBeLessThan(jpeg.length);
    expect(readImage((await media.file('living-room.webp', 640)).bytes)).toMatchObject({ width: 640 });
    // A file that only starts as an image is kept as it arrived, as it was before there was an optimizer.
    expect((await media.upload(owner, { fileName: 'cut.jpg', bytes: jpeg.subarray(0, 4000) })).url).toBe('/media/cut.jpg');
  });
});
