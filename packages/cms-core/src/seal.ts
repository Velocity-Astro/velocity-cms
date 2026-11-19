import { ConflictError } from './errors.js';

type SealKey = Awaited<ReturnType<typeof globalThis.crypto.subtle.importKey>>;

/** A key or password as it is kept: sealed, with what it takes to open it besides the site's secret. */
export interface Sealed {
  readonly iv: string;
  readonly sealed: string;
}

const toHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)));
const isSealed = (value: unknown): value is Sealed =>
  typeof value === 'object' && value !== null && typeof (value as { iv?: unknown }).iv === 'string' && typeof (value as { sealed?: unknown }).sealed === 'string';

/**
 * Seals keys and passwords with the site's secret before they are stored (AES-256-GCM), and
 * opens them again. `purpose` keeps one kind of secret apart from another: what is sealed for
 * one cannot be opened as the other.
 */
export class SecretSeal {
  #key: Promise<SealKey> | null = null;

  constructor(
    private readonly secret: string | undefined,
    private readonly purpose: string,
  ) {}

  /** Whether the site has a secret to seal with. */
  get canSeal(): boolean {
    return this.secret !== undefined && this.secret.length >= 32;
  }

  async seal(text: string): Promise<Sealed> {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const sealed = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.#sealKey(), new TextEncoder().encode(text));
    return { iv: toHex(iv), sealed: toHex(new Uint8Array(sealed)) };
  }

  /** What was sealed, or `undefined` when it cannot be opened: the site's secret changed since. */
  async open(stored: unknown): Promise<string | undefined> {
    if (!isSealed(stored)) return undefined;
    try {
      const opened = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(stored.iv) }, await this.#sealKey(), fromHex(stored.sealed));
      return new TextDecoder().decode(opened);
    } catch {
      return undefined;
    }
  }

  #sealKey(): Promise<SealKey> {
    const { secret } = this;
    if (secret === undefined || secret.length < 32) {
      throw new ConflictError('This site has no secret to seal keys and passwords with. Set VELOCITY_CMS_SECRET to at least 32 characters, then save this again.');
    }
    this.#key ??= (async () => {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${this.purpose}\n${secret}`));
      return globalThis.crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
    })();
    return this.#key;
  }
}
