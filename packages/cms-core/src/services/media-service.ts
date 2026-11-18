import type { AccessControl, Actor } from '../access.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import type { EventBus } from '../events.js';
import { readImage } from '../image-file.js';
import type { MediaFile, SiteImage } from '../model.js';
import type { Clock, ImageLibrary, MediaRepository, MediaStore, StoredFile } from '../ports.js';

/** Where uploads are kept: their records and their files. */
export interface MediaStorage {
  readonly files: MediaRepository;
  readonly store: MediaStore;
}

export interface MediaServiceOptions {
  /** Without it the site takes no uploads, and image fields choose from the site's own images only. */
  readonly storage?: MediaStorage | undefined;
  /** Where the site serves uploads from. Defaults to `/media`. */
  readonly basePath?: string | undefined;
  /** The largest file accepted, in bytes. Defaults to 4 MB, which every host we deploy to lets through. */
  readonly maxBytes?: number | undefined;
}

export interface NewUpload {
  /** The file's name on the person's computer. It only suggests what the image is called. */
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

const MAX_NAME_LENGTH = 80;
/** The longest side an image may have. Larger than any screen shows, small enough to resize safely. */
const MAX_SIDE = 12_000;

/** A name for an image from its file's name: `Front Porch (1).JPG` is `front-porch-1`. */
function nameFrom(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  const words = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_NAME_LENGTH)
    .replace(/^-+|-+$/g, '');
  return words || 'image';
}

/** The images an image field chooses from: the site's own and the ones people upload. */
export class MediaService {
  readonly #libraries = new Set<ImageLibrary>();
  readonly #basePath: string;
  readonly #maxBytes: number;

  constructor(
    private readonly access: AccessControl,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly options: MediaServiceOptions = {},
  ) {
    this.#basePath = `/${(options.basePath ?? '/media').split('/').filter(Boolean).join('/')}`;
    this.#maxBytes = options.maxBytes ?? 4_000_000;
  }

  /**
   * Adds images the site already has, such as a folder in the project. Only the site knows
   * where they are, so it tells the CMS. Including the same library twice changes nothing.
   */
  include(library: ImageLibrary): void {
    this.#libraries.add(library);
  }

  /** Whether this site can take an upload. */
  get takesUploads(): boolean {
    return this.options.storage !== undefined;
  }

  /** The largest upload accepted, in bytes. */
  get maxUploadBytes(): number {
    return this.#maxBytes;
  }

  /** Every image there is to choose from, ordered by name. */
  async images(actor: Actor): Promise<readonly SiteImage[]> {
    this.access.require(actor, 'entry:read');
    const all = [...(await this.#included()), ...(await this.uploads(actor))];
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The uploaded images alone, ordered by name, for a site whose pages show them. */
  async uploads(actor: Actor): Promise<readonly SiteImage[]> {
    this.access.require(actor, 'entry:read');
    return ((await this.options.storage?.files.list()) ?? []).map((file) => this.#asImage(file));
  }

  /**
   * Takes a new image. The file is checked by what it holds, never by what it is called: it
   * must be a JPEG, PNG or WebP. It gets a name no other image has, made from the file's own.
   */
  async upload(actor: Actor, upload: NewUpload): Promise<SiteImage> {
    this.access.require(actor, 'entry:write');
    const storage = this.options.storage;
    if (!storage) {
      throw new ConflictError("This site has nowhere to keep uploads yet. Set up storage for them, or add the image to the site's image folder.");
    }

    const { bytes } = upload;
    const refuse = (message: string) => new ValidationError(message, [{ path: ['file'], message }]);
    if (bytes.length === 0) throw refuse('The file is empty. Choose an image to upload.');
    if (bytes.length > this.#maxBytes) {
      throw refuse(`The file is ${megabytes(bytes.length)} MB. An upload can be ${megabytes(this.#maxBytes)} MB at most, so make it smaller first.`);
    }
    const facts = readImage(bytes);
    if (!facts) throw refuse('The file is not an image this site can show. Upload a JPEG, PNG or WebP.');
    if (facts.width > MAX_SIDE || facts.height > MAX_SIDE) {
      throw refuse(`The image is ${facts.width} by ${facts.height} pixels. The longest side can be ${MAX_SIDE} at most.`);
    }

    const name = await this.#freeName(nameFrom(upload.fileName), storage);
    const file: MediaFile = {
      name,
      key: `${name}.${facts.extension}`,
      contentType: facts.contentType,
      width: facts.width,
      height: facts.height,
      size: bytes.length,
      createdAt: this.clock.now(),
      createdBy: actor.id,
    };
    // The record goes first: it is what keeps two uploads from taking the same name.
    await storage.files.add(file);
    try {
      await storage.store.put(file.key, { bytes, contentType: file.contentType });
    } catch (error) {
      await storage.files.remove(name);
      throw error;
    }
    await this.events.emit('media.uploaded', { file, actor });
    return this.#asImage(file);
  }

  /**
   * Removes an uploaded image: its file and its record. This cannot be undone, and an entry that
   * shows the image shows nothing in its place afterwards, so only people who may publish may do
   * it. An image the site came with is not ours to remove.
   */
  async remove(actor: Actor, name: string): Promise<void> {
    this.access.require(actor, 'entry:publish');
    const storage = this.options.storage;
    const file = await storage?.files.get(name);
    if (!storage || !file) {
      if ((await this.#included()).some((image) => image.name === name)) {
        throw new ConflictError(`"${name}" comes with the site, so it can't be removed here. Take it out of the site's image folder instead.`);
      }
      throw new NotFoundError('Image', name);
    }
    // The record goes first: once it is gone nothing offers the image, even if the file lingers.
    await storage.files.remove(name);
    await storage.store.remove(file.key);
    await this.events.emit('media.removed', { file, actor });
  }

  /**
   * An uploaded file by its key, for the site to serve. Anyone may see it: an upload is public
   * from the moment it exists, as a file in the site's image folder is.
   */
  async file(key: string): Promise<StoredFile> {
    const file = await this.options.storage?.store.get(key);
    if (!file) throw new NotFoundError('Image', key);
    return file;
  }

  async #included(): Promise<SiteImage[]> {
    return (await Promise.all([...this.#libraries].map((library) => library.list()))).flat();
  }

  /** The name itself if nothing has it, otherwise the first of `name-2`, `name-3`… that is free. */
  async #freeName(wanted: string, storage: MediaStorage): Promise<string> {
    const taken = new Set([...(await this.#included()), ...(await storage.files.list())].map((image) => image.name));
    let name = wanted;
    for (let count = 2; taken.has(name); count += 1) name = `${wanted}-${count}`;
    return name;
  }

  #asImage(file: MediaFile): SiteImage {
    return { name: file.name, url: `${this.#basePath}/${file.key}`, width: file.width, height: file.height, uploadedAt: file.createdAt, size: file.size };
  }
}

const megabytes = (bytes: number): string => (bytes / 1_000_000).toFixed(1).replace(/\.0$/, '');
