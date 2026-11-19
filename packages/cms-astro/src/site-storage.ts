import { ConflictError, isPrivateAddress, type BucketAccount, type MediaStore, type NameLookup, type SettingFixedBy, type StorageKeeping, type StorageRoom, type StoredFile } from '@velocity-astro/cms-core';
import { S3MediaStore, StorageRefusedError } from './media-store.js';

export interface SiteMediaStoreOptions {
  /** The bucket an owner named in the editor's settings, read when it is needed. */
  readonly account: () => Promise<BucketAccount | null>;
  /** The store the server's own settings or the site's host name. It wins over the editor's. */
  readonly fixed?: MediaStore | undefined;
  /** Whether a host runs this site among many. Its uploads are then the host's to place, and the editor's settings are never used. */
  readonly hosted?: boolean;
  /** The folder on the server's disk, where there is one: where uploads go until a bucket is named, and where earlier ones are still read. */
  readonly folder?: MediaStore | undefined;
  /** Every address a host's name leads to, so a bucket's address that leads to a private machine is refused. */
  readonly lookup: NameLookup;
  /** Defaults to the platform's own `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  /** How long the editor's settings are believed before they are read again. Defaults to five seconds. */
  readonly believeForMs?: number;
}

/** A small PNG: one see-through pixel. What a test keeps in the bucket, reads back and removes. */
const PIXEL = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (letter) => letter.charCodeAt(0));

/**
 * Where one site's uploads are kept, decided as each file is kept or read: the store the server
 * or the host fixed, then the bucket an owner named in the editor, then the folder on the
 * server's disk. The editor's settings are read again every few seconds, so every running copy
 * follows a change. A file kept on the disk before a bucket was named is still read from there.
 */
export class SiteMediaStore implements MediaStore {
  readonly #options: SiteMediaStoreOptions;
  #named: { readonly at: number; readonly store: Promise<MediaStore | undefined> } | null = null;

  constructor(options: SiteMediaStoreOptions) {
    this.#options = options;
  }

  async ready(): Promise<boolean> {
    return (await this.#place()) !== undefined;
  }

  async put(key: string, file: StoredFile): Promise<void> {
    const place = await this.#place();
    if (!place) throw new ConflictError('This site has nowhere to keep uploads yet. An owner can set storage up under Settings, Storage.');
    await place.put(key, file);
  }

  async get(key: string): Promise<StoredFile | null> {
    const place = await this.#place();
    const { folder } = this.#options;
    const found = (await place?.get(key)) ?? null;
    // An image uploaded before the bucket was named is still on the disk.
    return found === null && folder && place !== folder ? folder.get(key) : found;
  }

  async remove(key: string): Promise<void> {
    const place = await this.#place();
    const { folder } = this.#options;
    await place?.remove(key);
    if (folder && place !== folder) await folder.remove(key);
  }

  /** What the settings screen asks: who decides, where an upload would go, and whether the named bucket works. */
  room(): StorageRoom {
    return {
      fixedBy: () => this.#fixedBy(),
      keeping: () => this.#keeping(),
      test: () => this.#test(),
    };
  }

  #fixedBy(): SettingFixedBy | null {
    return this.#options.hosted === true ? 'host' : this.#options.fixed ? 'server' : null;
  }

  async #keeping(): Promise<StorageKeeping> {
    const place = await this.#place().catch(() => undefined);
    return place === undefined ? 'none' : place === this.#options.folder ? 'folder' : 'bucket';
  }

  async #place(): Promise<MediaStore | undefined> {
    const { fixed, folder } = this.#options;
    if (fixed || this.#options.hosted === true) return fixed;
    return (await this.#bucket()) ?? folder;
  }

  /** The bucket the editor's settings name, made anew when they are read again. */
  #bucket(): Promise<MediaStore | undefined> {
    const now = Date.now();
    if (this.#named === null || now - this.#named.at >= (this.#options.believeForMs ?? 5000)) {
      const store = this.#options.account().then((account) => (account === null ? undefined : this.#storeFor(account)));
      const named = { at: now, store };
      this.#named = named;
      // A failure is not believed for five seconds: the next file asks again.
      store.catch(() => {
        if (this.#named === named) this.#named = null;
      });
    }
    return this.#named.store;
  }

  async #storeFor(account: BucketAccount): Promise<MediaStore> {
    const host = new URL(account.endpoint).hostname;
    const addresses = await this.#options.lookup(host).catch(() => []);
    if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
      throw new ConflictError(`The storage service's address, ${host}, leads nowhere this site may send files. Check it under Settings, Storage.`);
    }
    const send = this.#options.fetch ?? globalThis.fetch;
    // An answer that sends the request elsewhere is refused: only the address that was checked is used.
    return new S3MediaStore({ ...account, fetch: (input, init) => send(input, { ...init, redirect: 'error' }) });
  }

  async #test(): Promise<void> {
    const account = await this.#options.account();
    if (account === null) throw new ConflictError('There is no bucket to try yet. Save its address, name and both keys first.');
    const bucket = await this.#storeFor(account);
    const key = `connection-test-${globalThis.crypto.randomUUID().replace(/-/g, '')}.png`;
    try {
      await bucket.put(key, { bytes: PIXEL, contentType: 'image/png' });
      const back = await bucket.get(key);
      await bucket.remove(key);
      if (back === null || back.bytes.length !== PIXEL.length) throw new ConflictError('The bucket took a file and did not give it back. Check that the keys may read from it as well as write.');
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      if (!(error instanceof StorageRefusedError)) {
        throw new ConflictError('The storage service could not be reached. Check its address, and the region if the service has more than one.');
      }
      const { status } = error;
      throw new ConflictError(
        status === 401 || status === 403
          ? `The storage service refused the keys (${status}). Check that both were pasted whole, and that they may read, write and delete in this bucket.`
          : status === 404
            ? 'The storage service knows no bucket of this name (404). Check the name, and that the address is the one for your account.'
            : status === 400
              ? 'The storage service did not accept the request (400). Check the region: it must be the one the bucket is in.'
              : `The storage service could not keep a file (${status}). Try again in a moment.`,
      );
    }
    // What was just proved is used at once, not in five seconds.
    this.#named = null;
  }
}
