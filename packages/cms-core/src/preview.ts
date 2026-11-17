import type { Clock } from './ports.js';

type Key = Awaited<ReturnType<typeof globalThis.crypto.subtle.importKey>>;

const encoder = new TextEncoder();
const toHex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));

/**
 * Makes and checks the token in a preview link. Whoever holds a valid token sees the site with
 * the versions being worked on, until the token expires. Nobody else ever sees a draft.
 *
 * The token is an expiry time signed with the site's secret, so it needs no storage and cannot
 * be made, or have its life extended, without the secret.
 */
export class PreviewLinks {
  readonly #secret: string;
  readonly #clock: Clock;
  #key: Promise<Key> | undefined;

  constructor(secret: string, clock: Clock = { now: () => new Date().toISOString() }) {
    if (secret.length < 32) {
      throw new Error('The preview secret must be at least 32 characters. Generate one with `openssl rand -hex 32`.');
    }
    this.#secret = secret;
    this.#clock = clock;
  }

  /** A token good for `minutes` from now. One hour unless told otherwise. */
  async issue(minutes = 60): Promise<string> {
    const expires = String(Date.parse(this.#clock.now()) + minutes * 60_000);
    const signature = await globalThis.crypto.subtle.sign('HMAC', await this.key(), encoder.encode(expires));
    return `${expires}.${toHex(signature)}`;
  }

  /** True only for a token this secret signed that has not expired. Any other text is simply false. */
  async verify(token: string): Promise<boolean> {
    const [expires = '', signature = '', ...rest] = token.split('.');
    if (rest.length > 0 || !/^\d{1,16}$/.test(expires) || !/^[0-9a-f]{64}$/.test(signature)) return false;
    if (Number(expires) <= Date.parse(this.#clock.now())) return false;
    return globalThis.crypto.subtle.verify('HMAC', await this.key(), fromHex(signature), encoder.encode(expires));
  }

  private key(): Promise<Key> {
    this.#key ??= globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(this.#secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
    return this.#key;
  }
}
