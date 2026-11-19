import { beforeEach, describe, expect, it } from 'vitest';
import { AccessControl, type Actor } from './access.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { EventBus } from './events.js';
import { readImage } from './image-file.js';
import type { ImageOptimizer } from './ports.js';
import { MediaService } from './services/media-service.js';
import { mediaRepositoryContract, mediaStoreContract } from './testing/contracts.js';
import { FakeClock, InMemoryImageLibrary, InMemoryMediaRepository, InMemoryMediaStore, tinyJpeg, tinyPng, tinyWebp } from './testing/in-memory.js';

mediaRepositoryContract('InMemoryMediaRepository', async () => new InMemoryMediaRepository());
mediaStoreContract('InMemoryMediaStore', async () => new InMemoryMediaStore());

const text = (value: string) => new TextEncoder().encode(value);

describe('readImage', () => {
  it('reads the kind and the size from a PNG and a JPEG', () => {
    expect(readImage(tinyPng(1600, 900))).toEqual({ contentType: 'image/png', extension: 'png', width: 1600, height: 900 });
    expect(readImage(tinyJpeg(4000, 3000))).toEqual({ contentType: 'image/jpeg', extension: 'jpg', width: 4000, height: 3000 });
  });

  it('reads the three kinds of WebP', () => {
    const riff = (kind: string, rest: number[]) => Uint8Array.from([...text('RIFF'), 0, 0, 0, 0, ...text('WEBP'), ...text(kind), 0, 0, 0, 0, ...rest, ...new Array<number>(12).fill(0)]);
    // 800 by 600 in each kind's own way of writing a size.
    expect(readImage(riff('VP8X', [0, 0, 0, 0, 0x1f, 0x03, 0, 0x57, 0x02, 0]))).toMatchObject({ contentType: 'image/webp', width: 800, height: 600 });
    expect(readImage(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x20, 0x03, 0x58, 0x02]))).toMatchObject({ width: 800, height: 600 });
    expect(readImage(riff('VP8L', [0x2f, 0x1f, 0xc3, 0x95, 0x00]))).toMatchObject({ width: 800, height: 600 });
  });

  it('answers null for anything else, whatever it is called', () => {
    expect(readImage(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(readImage(text('GIF89a'))).toBeNull();
    expect(readImage(new Uint8Array())).toBeNull();
    // A JPEG that ends before it says how large it is.
    expect(readImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]))).toBeNull();
    expect(readImage(tinyPng(0, 10))).toBeNull();
  });
});

describe('MediaService', () => {
  const owner: Actor = { kind: 'user', id: 'u1', role: 'owner' };
  const author: Actor = { kind: 'user', id: 'u2', role: 'author' };
  let files: InMemoryMediaRepository;
  let store: InMemoryMediaStore;
  let events: EventBus;
  let media: MediaService;

  beforeEach(() => {
    files = new InMemoryMediaRepository();
    store = new InMemoryMediaStore();
    events = new EventBus();
    media = new MediaService(new AccessControl(), events, new FakeClock(), { storage: { files, store }, maxBytes: 1000 });
    media.include(new InMemoryImageLibrary([{ name: 'porch', url: '/_astro/porch.jpg' }]));
  });

  it('keeps an upload, records what it is and announces it', async () => {
    const announced: string[] = [];
    events.on('media.uploaded', ({ file }) => void announced.push(file.name));
    const bytes = tinyPng(1600, 900);
    const image = await media.upload(author, { fileName: 'C:\\Photos\\Été à la Maison (1).PNG', bytes });

    expect(image).toMatchObject({ name: 'ete-a-la-maison-1', url: '/media/ete-a-la-maison-1.png', width: 1600, height: 900 });
    expect(await files.get('ete-a-la-maison-1')).toMatchObject({ key: 'ete-a-la-maison-1.png', contentType: 'image/png', size: bytes.length, createdBy: 'u2' });
    expect((await media.file('ete-a-la-maison-1.png')).contentType).toBe('image/png');
    expect(announced).toEqual(['ete-a-la-maison-1']);
  });

  it('believes the file, not its name', async () => {
    const image = await media.upload(owner, { fileName: 'photo.png', bytes: tinyJpeg() });
    expect(image.url).toBe('/media/photo.jpg');
    await expect(media.upload(owner, { fileName: 'photo.jpg', bytes: text('<html>') })).rejects.toBeInstanceOf(ValidationError);
  });

  it('never gives two images the same name, uploaded or in the site\'s folder', async () => {
    expect((await media.upload(owner, { fileName: 'porch.jpg', bytes: tinyJpeg() })).name).toBe('porch-2');
    expect((await media.upload(owner, { fileName: 'porch.jpg', bytes: tinyJpeg() })).name).toBe('porch-3');
    expect((await media.upload(owner, { fileName: '???.jpg', bytes: tinyJpeg() })).name).toBe('image');
    expect((await media.images(author)).map((image) => image.name)).toEqual(['image', 'porch', 'porch-2', 'porch-3']);
    expect((await media.uploads(author)).map((image) => image.name)).toEqual(['image', 'porch-2', 'porch-3']);
  });

  it('refuses an empty file, one that is too heavy and one that is too large, and says what to do', async () => {
    await expect(media.upload(owner, { fileName: 'a.png', bytes: new Uint8Array() })).rejects.toThrow('The file is empty');
    const heavy = new Uint8Array(1001);
    heavy.set(tinyPng());
    await expect(media.upload(owner, { fileName: 'a.png', bytes: heavy })).rejects.toThrow('make it smaller first');
    await expect(media.upload(owner, { fileName: 'a.png', bytes: tinyPng(20_000, 10) })).rejects.toThrow('The longest side can be 12000');
    expect(await files.list()).toEqual([]);
  });

  it('leaves no record behind when the file could not be kept', async () => {
    store.put = async () => {
      throw new Error('bucket is down');
    };
    await expect(media.upload(owner, { fileName: 'a.png', bytes: tinyPng() })).rejects.toThrow('bucket is down');
    expect(await files.list()).toEqual([]);
  });

  it('asks for the right to write, and says so when the site takes no uploads', async () => {
    const reader = { kind: 'user', id: 'u3', role: 'reader' } as unknown as Actor;
    await expect(media.upload(reader, { fileName: 'a.png', bytes: tinyPng() })).rejects.toThrow();
    const closed = new MediaService(new AccessControl(), events, new FakeClock());
    expect(closed.takesUploads).toBe(false);
    await expect(closed.upload(owner, { fileName: 'a.png', bytes: tinyPng() })).rejects.toBeInstanceOf(ConflictError);
    await expect(closed.file('a.png')).rejects.toBeInstanceOf(NotFoundError);
    expect(await closed.images(owner)).toEqual([]);
  });

  describe('with an optimizer', () => {
    const faults: unknown[] = [];
    /** Stands in for a real one: what it answers with is set by each case. */
    const optimizer: ImageOptimizer & { made: Uint8Array | null; fails: boolean } = {
      made: null,
      fails: false,
      async optimize(): Promise<Uint8Array | null> {
        if (this.fails) throw new Error('could not read it');
        return this.made;
      },
      async resize(_bytes: Uint8Array, width: number): Promise<Uint8Array | null> {
        if (this.fails) throw new Error('could not read it');
        return tinyWebp(width, 3);
      },
    };
    const padded = (image: Uint8Array, size: number): Uint8Array => {
      const bytes = new Uint8Array(size);
      bytes.set(image);
      return bytes;
    };

    beforeEach(() => {
      faults.length = 0;
      optimizer.made = null;
      optimizer.fails = false;
      media = new MediaService(new AccessControl(), events, new FakeClock(), {
        storage: { files, store },
        maxBytes: 1000,
        optimizer,
        onOptimizerFault: (error) => void faults.push(error),
      });
    });

    it('keeps the lighter copy, and records what the copy is', async () => {
      optimizer.made = tinyWebp(2560, 1440, 200);
      const image = await media.upload(owner, { fileName: 'Kitchen.JPG', bytes: padded(tinyJpeg(4000, 2250), 900) });
      expect(image).toMatchObject({ name: 'kitchen', url: '/media/kitchen.webp', width: 2560, height: 1440, size: 200, thumbnail: '/media/kitchen.webp?w=640' });
      expect(await files.get('kitchen')).toMatchObject({ key: 'kitchen.webp', contentType: 'image/webp', size: 200 });
      expect(await media.file('kitchen.webp')).toMatchObject({ contentType: 'image/webp', bytes: optimizer.made });
      // The file that arrived is kept nowhere.
      expect(await store.get('kitchen.jpg')).toBeNull();
    });

    it('keeps a copy that was turned, even when it is no lighter', async () => {
      optimizer.made = tinyWebp(3, 4, 500);
      expect(await media.upload(owner, { fileName: 'a.jpg', bytes: padded(tinyJpeg(4, 3), 400) })).toMatchObject({ url: '/media/a.webp', width: 3, height: 4 });
    });

    it('keeps the file as it arrived when the copy is no better, is not an image, or is larger', async () => {
      const bytes = padded(tinyJpeg(40, 30), 400);
      for (const made of [null, tinyWebp(40, 30, 400), new TextEncoder().encode('<html>'), tinyWebp(80, 60, 100), tinyWebp(40, 30, 2000)]) {
        optimizer.made = made;
        const image = await media.upload(owner, { fileName: 'b.jpg', bytes });
        expect(image).toMatchObject({ width: 40, height: 30, size: 400 });
        expect(image.url.endsWith('.jpg')).toBe(true);
      }
      expect(faults).toEqual([]);
    });

    it('never loses an upload over an optimizer that fails', async () => {
      optimizer.fails = true;
      const bytes = tinyPng(1600, 900);
      expect(await media.upload(owner, { fileName: 'c.png', bytes })).toMatchObject({ url: '/media/c.png', size: bytes.length });
      expect(faults).toHaveLength(1);
      // Nor a page over a small copy that cannot be made: it gets the image itself.
      expect((await media.file('c.png', 640)).bytes).toEqual(bytes);
      expect(faults).toHaveLength(2);
    });

    it('makes a small copy at the widths it offers and at no other', async () => {
      optimizer.made = tinyWebp(2560, 1440, 200);
      await media.upload(owner, { fileName: 'wide.jpg', bytes: padded(tinyJpeg(4000, 2250), 900) });
      const small = await media.file('wide.webp', 640);
      expect(readImage(small.bytes)).toMatchObject({ contentType: 'image/webp', width: 640 });
      await expect(media.file('wide.webp', 641)).rejects.toBeInstanceOf(NotFoundError);
      await expect(media.file('nothing.webp', 640)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('answers with the image itself when it is already that narrow, and offers no thumbnail', async () => {
      const image = await media.upload(owner, { fileName: 'logo.png', bytes: tinyPng(320, 80) });
      expect(image.thumbnail).toBeUndefined();
      expect((await media.file('logo.png', 640)).contentType).toBe('image/png');
    });
  });

  it('offers no small copies without an optimizer', async () => {
    const image = await media.upload(owner, { fileName: 'wide.png', bytes: tinyPng(1600, 900) });
    expect(image.thumbnail).toBeUndefined();
    await expect(media.file('wide.png', 640)).rejects.toBeInstanceOf(NotFoundError);
  });
});
