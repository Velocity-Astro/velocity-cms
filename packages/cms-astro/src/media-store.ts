import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MediaStore, StoredFile } from '@velocity-astro/cms-core';

/** A key is one file name the CMS made: nothing that could name a folder or another place. */
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:jpg|png|webp)$/;
const TYPES: Readonly<Record<string, string>> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const typeOf = (key: string): string => TYPES[key.slice(key.lastIndexOf('.') + 1)] ?? 'application/octet-stream';

function checked(key: string): string {
  if (!KEY.test(key)) throw new Error(`"${key}" is not a name an uploaded file can be kept under.`);
  return key;
}

/** Keeps uploads in a folder on the server's disk. For a site on a server of its own. */
export class FolderMediaStore implements MediaStore {
  constructor(private readonly directory: string) {}

  async put(key: string, file: StoredFile): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(path.join(this.directory, checked(key)), file.bytes);
  }

  async get(key: string): Promise<StoredFile | null> {
    if (!KEY.test(key)) return null;
    try {
      return { bytes: new Uint8Array(await readFile(path.join(this.directory, key))), contentType: typeOf(key) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    if (KEY.test(key)) await rm(path.join(this.directory, key), { force: true });
  }
}

export interface S3MediaStoreOptions {
  /** The storage service's address: `https://<account>.r2.cloudflarestorage.com`, `https://s3.eu-west-1.amazonaws.com`. */
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Defaults to `auto`, which is what Cloudflare R2 takes. */
  readonly region?: string;
  /**
   * A folder inside the bucket to keep every file under, such as `sites/s-4f2a`. A host that
   * runs many sites gives each site its own, so one bucket holds them all and no site can
   * name another's file. Lowercase letters, digits and hyphens, in parts divided by `/`.
   */
  readonly prefix?: string;
  /** Defaults to the server's own `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  /** Defaults to now. */
  readonly now?: () => Date;
}

/** A prefix is made of plain parts, so it can never climb out of its folder or need encoding. */
const PREFIX = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes: Uint8Array): Promise<string> => hex(await crypto.subtle.digest('SHA-256', bytes));

async function hmac(key: ArrayBuffer | Uint8Array, text: string): Promise<ArrayBuffer> {
  const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', imported, encoder.encode(text));
}

/** The bucket answered and refused. `status` is its answer; the message holds its own words, for the server's log. */
export class StorageRefusedError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Keeps uploads in a bucket that speaks the S3 protocol: Cloudflare R2, Amazon S3, Backblaze B2,
 * MinIO and others. For a site on a host with no disk of its own. The bucket stays private: the
 * site reads from it with its key and serves the files itself.
 */
export class S3MediaStore implements MediaStore {
  readonly #options: S3MediaStoreOptions;
  readonly #region: string;
  /** Empty, or the prefix with its closing slash. */
  readonly #folder: string;

  constructor(options: S3MediaStoreOptions) {
    if (options.prefix !== undefined && !PREFIX.test(options.prefix)) {
      throw new Error(`"${options.prefix}" cannot be a prefix for uploads. Use lowercase letters, digits and hyphens, in parts divided by "/", such as "sites/s-4f2a".`);
    }
    this.#options = options;
    this.#region = options.region ?? 'auto';
    this.#folder = options.prefix ? `${options.prefix}/` : '';
  }

  async put(key: string, file: StoredFile): Promise<void> {
    const response = await this.#send('PUT', checked(key), file);
    if (!response.ok) throw await this.#failure('keep', key, response);
  }

  async get(key: string): Promise<StoredFile | null> {
    if (!KEY.test(key)) return null;
    const response = await this.#send('GET', key);
    if (response.status === 404) return null;
    if (!response.ok) throw await this.#failure('read', key, response);
    return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? typeOf(key) };
  }

  async remove(key: string): Promise<void> {
    if (!KEY.test(key)) return;
    const response = await this.#send('DELETE', key);
    if (!response.ok && response.status !== 404) throw await this.#failure('remove', key, response);
  }

  /** One request, signed the way the protocol asks (Signature Version 4). */
  async #send(method: string, key: string, file?: StoredFile): Promise<Response> {
    const { endpoint, bucket, accessKeyId, secretAccessKey } = this.#options;
    const url = new URL(`${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(bucket)}/${this.#folder}${key}`);
    const stamp = (this.#options.now?.() ?? new Date()).toISOString().replace(/[-:]|\.\d{3}/g, '');
    const day = stamp.slice(0, 8);
    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': await sha256(file?.bytes ?? new Uint8Array()),
      'x-amz-date': stamp,
      ...(file && { 'content-type': file.contentType }),
    };
    const names = Object.keys(headers).sort();
    const request = [
      method,
      url.pathname,
      '',
      ...names.map((name) => `${name}:${headers[name]}`),
      '',
      names.join(';'),
      headers['x-amz-content-sha256'],
    ].join('\n');
    const scope = `${day}/${this.#region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', stamp, scope, await sha256(encoder.encode(request))].join('\n');
    let signingKey: ArrayBuffer | Uint8Array = encoder.encode(`AWS4${secretAccessKey}`);
    for (const part of [day, this.#region, 's3', 'aws4_request']) signingKey = await hmac(signingKey, part);
    const signature = hex(await hmac(signingKey, toSign));

    const { host: _host, ...sent } = headers;
    return (this.#options.fetch ?? globalThis.fetch)(url, {
      method,
      headers: {
        ...sent,
        authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
      },
      ...(file && { body: file.bytes }),
    });
  }

  /** What went wrong, in the storage service's words. It goes to the server's log, not to the person. */
  async #failure(doing: string, key: string, response: Response): Promise<Error> {
    const said = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    return new StorageRefusedError(response.status, `The storage bucket "${this.#options.bucket}" refused to ${doing} "${key}" (${response.status}). ${said}`.trim());
  }
}

/**
 * Where this site keeps uploads, from its environment:
 *
 * - `VELOCITY_CMS_S3_BUCKET`, `VELOCITY_CMS_S3_ENDPOINT`, `VELOCITY_CMS_S3_ACCESS_KEY_ID` and
 *   `VELOCITY_CMS_S3_SECRET_ACCESS_KEY` (and `VELOCITY_CMS_S3_REGION`): a bucket.
 * - `VELOCITY_CMS_MEDIA_DIR`: a folder.
 * - Neither, with the database in a file: the folder `media` beside the database, since a
 *   server that keeps its database on disk has a disk to keep files on.
 * - Neither, with a hosted database: nowhere, and the site takes no uploads.
 */
export function mediaStoreFromEnv(databaseUrl: string, env: Readonly<Record<string, string | undefined>> = process.env): MediaStore | undefined {
  return bucketFromEnv(env) ?? folderFromEnv(databaseUrl, env);
}

/** The bucket the server's own settings name, or none. Settings that name only part of one are refused. */
export function bucketFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): S3MediaStore | undefined {
  const s3 = {
    bucket: env.VELOCITY_CMS_S3_BUCKET,
    endpoint: env.VELOCITY_CMS_S3_ENDPOINT,
    accessKeyId: env.VELOCITY_CMS_S3_ACCESS_KEY_ID,
    secretAccessKey: env.VELOCITY_CMS_S3_SECRET_ACCESS_KEY,
  };
  const given = Object.values(s3).filter(Boolean).length;
  if (s3.bucket && s3.endpoint && s3.accessKeyId && s3.secretAccessKey) {
    return new S3MediaStore({ ...s3, bucket: s3.bucket, endpoint: s3.endpoint, accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey, ...(env.VELOCITY_CMS_S3_REGION && { region: env.VELOCITY_CMS_S3_REGION }) });
  }
  if (given > 0) {
    throw new Error(
      'Uploads are set up only in part. A bucket needs all four of VELOCITY_CMS_S3_BUCKET, VELOCITY_CMS_S3_ENDPOINT, VELOCITY_CMS_S3_ACCESS_KEY_ID and VELOCITY_CMS_S3_SECRET_ACCESS_KEY.',
    );
  }
  return undefined;
}

/** The folder on the server's disk uploads are kept in: the one its settings name, or `media` beside a database that is a file. */
export function folderFromEnv(databaseUrl: string, env: Readonly<Record<string, string | undefined>> = process.env): FolderMediaStore | undefined {
  if (env.VELOCITY_CMS_MEDIA_DIR) return new FolderMediaStore(path.resolve(env.VELOCITY_CMS_MEDIA_DIR));
  if (databaseUrl.startsWith('file:')) return new FolderMediaStore(path.join(path.dirname(path.resolve(databaseUrl.slice('file:'.length))), 'media'));
  return undefined;
}
