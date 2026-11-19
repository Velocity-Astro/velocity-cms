import type { AccessControl, Actor } from '../access.js';
import { ConflictError, ValidationError, type ValidationIssue } from '../errors.js';
import type { EventBus } from '../events.js';
import type { BucketAccount, EmailProvider, EmailSettings, MailAccount, StorageSettings } from '../model.js';
import type { MailRoom, SettingsStore, StorageRoom } from '../ports.js';
import type { SecretSeal, Sealed } from '../seal.js';

/** How email is sent, as the editor sends it. */
export interface EmailSettingsChanges {
  /** Left out, the provider stays as it is. */
  readonly provider?: EmailProvider;
  /** Who the emails come from: an address, or a name and an address as `Name <address>`. */
  readonly from: string;
  /** The provider's key. Left out, the one that is saved stays; `null` takes it away. */
  readonly apiKey?: string | null;
  /** The revision the editor loaded. */
  readonly expectedRevision: number;
}

export const EMAIL_PROVIDERS: readonly EmailProvider[] = ['resend'];
export const MAX_EMAIL_FROM_LENGTH = 200;
export const MAX_EMAIL_KEY_LENGTH = 500;

/** Where uploads are kept, as the editor sends it. */
export interface StorageSettingsChanges {
  /** The storage service's address, over https. */
  readonly endpoint: string;
  readonly bucket: string;
  /** Left out or empty for `auto`. */
  readonly region?: string;
  readonly accessKeyId: string;
  /** The bucket's secret key. Left out, the one that is saved stays; `null` takes it away. */
  readonly secretAccessKey?: string | null;
  /** The revision the editor loaded. */
  readonly expectedRevision: number;
}

export const MAX_STORAGE_FIELD_LENGTH = 300;

const EMAIL = 'email';
const STORAGE = 'storage';
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const REGION = /^[a-z0-9-]{1,40}$/;

/**
 * A storage service's address as it is kept: `https`, a host by name and nothing after it but a
 * path. `null` for anything else. A number instead of a name, this machine and an address that
 * carries a name and password are refused: what an owner types must not be a way to reach a
 * machine beside the site.
 */
export function storageEndpointFrom(typed: string): string | null {
  const text = typed.trim();
  if (text.length > MAX_STORAGE_FIELD_LENGTH || !URL.canParse(text)) return null;
  const url = new URL(text);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.port !== '') return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^[0-9.]+$/.test(host) || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return null;
  return `https://${host}${url.pathname.replace(/\/+$/, '')}`;
}

/** The storage part as it is stored. The secret key is sealed. */
interface StoredStorage {
  readonly endpoint: string;
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secret?: Sealed;
}

const isStoredStorage = (value: unknown): value is StoredStorage =>
  typeof value === 'object' && value !== null && (['endpoint', 'bucket', 'region', 'accessKeyId'] as const).every((key) => typeof (value as Record<string, unknown>)[key] === 'string');
const ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const NAMED = /^([^<>"\r\n]{1,100})<([^<>]+)>$/;

/** A sender as it is kept: `address`, or `Name <address>`. `null` when it is neither. */
export function senderFrom(typed: string): string | null {
  const text = typed.trim();
  if (ADDRESS.test(text)) return text;
  const named = NAMED.exec(text);
  const name = named?.[1]?.trim();
  const address = named?.[2]?.trim();
  return name && address !== undefined && ADDRESS.test(address) ? `${name} <${address}>` : null;
}

/** The email part as it is stored. The key is sealed. */
interface StoredEmail {
  readonly provider: EmailProvider;
  readonly from: string;
  readonly key?: Sealed;
}

const isStoredEmail = (value: unknown): value is StoredEmail =>
  typeof value === 'object' && value !== null && typeof (value as { from?: unknown }).from === 'string' && EMAIL_PROVIDERS.includes((value as { provider: EmailProvider }).provider);

/**
 * Owns what an owner sets up for the site in the editor in place of a setting of the server:
 * how its email is sent, to begin with. A key is sealed with the site's secret before it is
 * kept and is never handed back to the editor. Where the server's own settings or the site's
 * code already decide something, they win, and the editor says so.
 */
export class SettingsService {
  #mail: MailRoom | null = null;
  #storage: StorageRoom | null = null;

  constructor(
    private readonly store: SettingsStore,
    private readonly seal: SecretSeal,
    private readonly access: AccessControl,
    private readonly events: EventBus,
  ) {}

  /** Tells the service how email leaves this site. A host calls it once it knows. */
  useMail(room: MailRoom): void {
    this.#mail = room;
  }

  /** How email is sent, for the settings screen. Owners only. */
  async email(actor: Actor): Promise<EmailSettings> {
    this.access.require(actor, 'settings:manage');
    return this.#shown();
  }

  /** Saves how email is sent. Owners only. */
  async saveEmail(actor: Actor, changes: EmailSettingsChanges): Promise<EmailSettings> {
    this.access.require(actor, 'settings:manage');
    const kept = await this.store.get(EMAIL);
    const current = kept !== null && isStoredEmail(kept.value) ? kept.value : null;
    const revision = kept?.revision ?? 0;
    if (revision !== changes.expectedRevision) throw new ConflictError('The email settings were changed by someone else. Reload them and try again.');

    const issues: ValidationIssue[] = [];
    const provider = changes.provider ?? current?.provider ?? 'resend';
    if (!EMAIL_PROVIDERS.includes(provider)) issues.push({ path: ['provider'], message: 'Choose one of the email services listed.' });
    const from = changes.from.length > MAX_EMAIL_FROM_LENGTH ? null : senderFrom(changes.from);
    if (from === null) issues.push({ path: ['from'], message: 'Give an address such as hello@example.com, or a name with it: Lakeshore Realty <hello@example.com>.' });
    const typedKey = typeof changes.apiKey === 'string' ? changes.apiKey.trim() : undefined;
    if (typedKey !== undefined && (typedKey === '' || typedKey.length > MAX_EMAIL_KEY_LENGTH || /\s/.test(typedKey))) {
      issues.push({ path: ['apiKey'], message: typedKey === '' ? 'Paste the API key.' : 'This does not look like an API key. Paste it as the email service shows it.' });
    }
    if (issues.length > 0 || from === null) throw new ValidationError(issues.length === 1 ? 'One thing about the email settings needs another look.' : `${issues.length} things about the email settings need another look.`, issues);

    const key = changes.apiKey === null ? undefined : typedKey !== undefined ? await this.seal.seal(typedKey) : current?.key;
    const next: StoredEmail = { provider, from, ...(key !== undefined && { key }) };
    await this.store.save(EMAIL, next, revision + 1, kept === null ? null : revision);
    await this.events.emit('settings.saved', { area: 'email', actor });
    return this.#shown();
  }

  /**
   * Sends a test email to whoever asks, the way email is sent now, so they know it works
   * before a sign-in link depends on it. Owners only.
   */
  async testEmail(actor: Actor): Promise<void> {
    this.access.require(actor, 'settings:manage');
    const room = this.#mail;
    if (room === null || !(await room.canTest())) {
      throw new ConflictError('No test email can be sent yet. Save an API key and a sender first.');
    }
    await room.sendTest(actor);
  }

  /**
   * What the editor's settings give to send email with, for the site's own server, or `null`
   * when they are not complete. No permission is asked, and nothing else may call it: this is
   * the one place a saved key is opened.
   */
  async mailAccount(): Promise<MailAccount | null> {
    const kept = await this.store.get(EMAIL);
    if (kept === null || !isStoredEmail(kept.value) || kept.value.from === '') return null;
    const apiKey = await this.seal.open(kept.value.key);
    return apiKey === undefined ? null : { provider: kept.value.provider, apiKey, from: kept.value.from };
  }

  /** Tells the service how uploads are kept on this site. A host calls it once it knows. */
  useStorage(room: StorageRoom): void {
    this.#storage = room;
  }

  /** Where uploads are kept, for the settings screen. Owners only. */
  async storage(actor: Actor): Promise<StorageSettings> {
    this.access.require(actor, 'settings:manage');
    return this.#shownStorage();
  }

  /** Saves the bucket uploads are kept in. Owners only. */
  async saveStorage(actor: Actor, changes: StorageSettingsChanges): Promise<StorageSettings> {
    this.access.require(actor, 'settings:manage');
    const kept = await this.store.get(STORAGE);
    const current = kept !== null && isStoredStorage(kept.value) ? kept.value : null;
    const revision = kept?.revision ?? 0;
    if (revision !== changes.expectedRevision) throw new ConflictError('The storage settings were changed by someone else. Reload them and try again.');

    const issues: ValidationIssue[] = [];
    const endpoint = storageEndpointFrom(changes.endpoint);
    if (endpoint === null) issues.push({ path: ['endpoint'], message: 'Give the storage service\'s address, starting with https://, as the service shows it.' });
    const bucket = changes.bucket.trim();
    if (!BUCKET.test(bucket)) issues.push({ path: ['bucket'], message: 'Give the bucket\'s name as the storage service shows it: lowercase letters, digits, dots and hyphens.' });
    const region = (changes.region ?? '').trim().toLowerCase();
    if (region !== '' && !REGION.test(region)) issues.push({ path: ['region'], message: 'Give the region as the storage service writes it, such as eu-west-1, or leave this empty.' });
    const accessKeyId = changes.accessKeyId.trim();
    if (accessKeyId === '' || accessKeyId.length > MAX_STORAGE_FIELD_LENGTH || /\s/.test(accessKeyId)) issues.push({ path: ['accessKeyId'], message: 'Paste the access key ID.' });
    const typedSecret = typeof changes.secretAccessKey === 'string' ? changes.secretAccessKey.trim() : undefined;
    if (typedSecret !== undefined && (typedSecret === '' || typedSecret.length > MAX_STORAGE_FIELD_LENGTH || /\s/.test(typedSecret))) {
      issues.push({ path: ['secretAccessKey'], message: typedSecret === '' ? 'Paste the secret access key.' : 'This does not look like a secret access key. Paste it as the storage service shows it.' });
    }
    if (issues.length > 0 || endpoint === null) throw new ValidationError(issues.length === 1 ? 'One thing about the storage settings needs another look.' : `${issues.length} things about the storage settings need another look.`, issues);

    const secret = changes.secretAccessKey === null ? undefined : typedSecret !== undefined ? await this.seal.seal(typedSecret) : current?.secret;
    const next: StoredStorage = { endpoint, bucket, region, accessKeyId, ...(secret !== undefined && { secret }) };
    await this.store.save(STORAGE, next, revision + 1, kept === null ? null : revision);
    await this.events.emit('settings.saved', { area: 'storage', actor });
    return this.#shownStorage();
  }

  /** Tries the bucket the settings name: keeps a small file there, reads it back and removes it. Owners only. */
  async testStorage(actor: Actor): Promise<void> {
    this.access.require(actor, 'settings:manage');
    if (this.#storage === null || (await this.bucketAccount()) === null) {
      throw new ConflictError('There is no bucket to try yet. Save its address, name and both keys first.');
    }
    await this.#storage.test();
  }

  /**
   * The bucket the editor's settings name, for the site's own server, or `null` when they are
   * not complete. No permission is asked, and nothing else may call it: this is the one place
   * the saved secret key is opened.
   */
  async bucketAccount(): Promise<BucketAccount | null> {
    const kept = await this.store.get(STORAGE);
    if (kept === null || !isStoredStorage(kept.value)) return null;
    const { endpoint, bucket, region, accessKeyId, secret } = kept.value;
    const secretAccessKey = await this.seal.open(secret);
    return secretAccessKey === undefined ? null : { endpoint, bucket, accessKeyId, secretAccessKey, ...(region !== '' && { region }) };
  }

  async #shownStorage(): Promise<StorageSettings> {
    const kept = await this.store.get(STORAGE);
    const current = kept !== null && isStoredStorage(kept.value) ? kept.value : null;
    const hasSecret = current?.secret !== undefined && (await this.seal.open(current.secret)) !== undefined;
    const fixedBy = this.#storage?.fixedBy() ?? null;
    return {
      endpoint: current?.endpoint ?? '',
      bucket: current?.bucket ?? '',
      region: current?.region ?? '',
      accessKeyId: current?.accessKeyId ?? '',
      hasSecret,
      ...(fixedBy !== null && { fixedBy }),
      keeping: (await this.#storage?.keeping()) ?? (hasSecret ? 'bucket' : 'none'),
      revision: kept?.revision ?? 0,
    };
  }

  async #shown(): Promise<EmailSettings> {
    const kept = await this.store.get(EMAIL);
    const current = kept !== null && isStoredEmail(kept.value) ? kept.value : null;
    // A key sealed with a secret the site no longer has is as good as none: it is asked for again.
    const hasKey = current?.key !== undefined && (await this.seal.open(current.key)) !== undefined;
    const fixedBy = this.#mail?.fixedBy() ?? null;
    const complete = hasKey && current.from !== '';
    return {
      provider: current?.provider ?? 'resend',
      from: current?.from ?? '',
      hasKey,
      ...(fixedBy !== null && { fixedBy }),
      sending: fixedBy !== null || complete,
      canTest: (await this.#mail?.canTest()) ?? false,
      revision: kept?.revision ?? 0,
    };
  }
}
