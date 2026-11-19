import type { AccessControl, Actor } from '../access.js';
import { ConflictError, ValidationError, type ValidationIssue } from '../errors.js';
import type { EventBus } from '../events.js';
import type { EmailProvider, EmailSettings, MailAccount } from '../model.js';
import type { MailRoom, SettingsStore } from '../ports.js';
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

const EMAIL = 'email';
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
