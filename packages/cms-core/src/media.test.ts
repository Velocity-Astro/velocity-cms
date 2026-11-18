import { beforeEach, describe, expect, it } from 'vitest';
import { AccessControl, type Actor } from './access.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { EventBus } from './events.js';
import { readImage } from './image-file.js';
import { MediaService } from './services/media-service.js';
import { mediaRepositoryContract, mediaStoreContract } from './testing/contracts.js';
import { FakeClock, InMemoryImageLibrary, InMemoryMediaRepository, InMemoryMediaStore, tinyJpeg, tinyPng } from './testing/in-memory.js';

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

    expect(image).toEqual({ name: 'ete-a-la-maison-1', url: '/media/ete-a-la-maison-1.png', width: 1600, height: 900 });
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
});
