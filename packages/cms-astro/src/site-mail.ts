import type { EmailChangeMail, InvitationMail, MailBrand, Mailer, SignInMail } from '@velocity-astro/cms-auth';
import { ConflictError, type Cms, type MailFixedBy } from '@velocity-astro/cms-core';
import type { NoticeMailer, SubmissionNotice } from './form-post.js';
import { mailImageUrl } from './mail-image.js';
import { MailRefusedError, ResendMailer, type TestMail } from './resend-mailer.js';
import type { SiteBrand } from './site-name.js';

export interface SiteMailOptions {
  /** The site's settings, where an owner may have said how email is sent. */
  readonly settings: Cms['settings'];
  /** The site's own mailer, from its code (`velocityCms({ mailer })`). It wins over everything. */
  readonly own?: Mailer | undefined;
  /** What sign-in links go to when nothing sends email: the server's log. */
  readonly fallback: Mailer;
  /** What an owner called the site in the editor, or `null`. It is what an email calls the site, when there is one. */
  readonly siteName?: () => Promise<string | null>;
  /** How the site looks, from its settings: its emails wear it. */
  readonly brand?: () => Promise<SiteBrand>;
  /** The site's own address: the foot of every email, and where its logo is loaded from. */
  readonly origin?: string;
  /** Whether a host runs this site among many, so what is fixed is fixed by the host. */
  readonly hosted?: boolean;
  /** Defaults to the server's own environment. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Defaults to the platform's own `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

type Tester = { sendTest(mail: TestMail): Promise<void> };

/** `Name <address>`: a sender's address with nothing in front of it, with the name it is sent under. */
export function namedSender(from: string, name: string | null | undefined): string {
  const clean = name?.replace(/[\p{Cc}<>"\\]/gu, '').replace(/\s+/g, ' ').trim();
  if (from.includes('<') || !clean) return from;
  return `"${clean}" <${from.trim()}>`;
}

const hasName = (from: string) => from.includes('<');

const takesNotices = (mailer: unknown): mailer is NoticeMailer =>
  typeof mailer === 'object' && mailer !== null && typeof (mailer as { sendSubmissionNotice?: unknown }).sendSubmissionNotice === 'function';
const sendsTests = (mailer: unknown): mailer is Tester => typeof mailer === 'object' && mailer !== null && typeof (mailer as { sendTest?: unknown }).sendTest === 'function';

/**
 * How one site's email leaves, decided each time one is sent: the site's own mailer from its
 * code, then Resend from the server's settings, then what an owner set up in the editor, and
 * for sign-in links with none of the three, the server's log. The editor's settings are read
 * from the database for every email, so every running copy follows a change at once, and the
 * key is held only for as long as the email takes.
 */
export class SiteMail implements Mailer, NoticeMailer {
  readonly #options: SiteMailOptions;

  constructor(options: SiteMailOptions) {
    this.#options = options;
  }

  /** Who decides how email is sent when the editor's settings do not. */
  fixedBy(): MailFixedBy | null {
    const fixed = this.#options.own ? 'code' : this.#serverFrom() ? 'server' : null;
    return fixed !== null && this.#options.hosted === true ? 'host' : fixed;
  }

  /** Who decides the name emails come from when the editor's sender name does not. */
  namesSender(): MailFixedBy | null {
    const fixed = this.fixedBy();
    if (fixed === 'code' || fixed === 'host') return fixed;
    const from = this.#serverFrom();
    return from !== undefined && hasName(from.from) ? 'server' : null;
  }

  async sendSignInLink(mail: SignInMail): Promise<void> {
    await ((await this.#mailer(mail.siteName)) ?? this.#options.fallback).sendSignInLink(await this.#dressed(mail));
  }

  async sendInvitation(mail: InvitationMail): Promise<void> {
    await ((await this.#mailer(mail.siteName)) ?? this.#options.fallback).sendInvitation(await this.#dressed(mail));
  }

  /**
   * The link that confirms a new address: through the site's own mailer when it sends these,
   * otherwise as the settings say, and with neither, the server's log.
   */
  async sendEmailChange(mail: EmailChangeMail): Promise<void> {
    const { own, fallback } = this.#options;
    const mailer = own?.sendEmailChange ? own : ((await this.#fromServer(mail.siteName)) ?? (await this.#fromEditor(mail.siteName)) ?? fallback);
    if (!mailer.sendEmailChange) throw new Error('No email provider is set up that can confirm a new address.');
    await mailer.sendEmailChange(await this.#dressed(mail));
  }

  /** A notice goes through the site's own mailer when it sends notices, and otherwise as the settings say. */
  async sendSubmissionNotice(mail: SubmissionNotice): Promise<void> {
    const { own } = this.#options;
    const mailer = takesNotices(own) ? own : ((await this.#fromServer(mail.siteName)) ?? (await this.#fromEditor(mail.siteName)));
    if (!mailer) throw new Error('No email provider is set up. Set one up under Settings, Email in the editor.');
    await mailer.sendSubmissionNotice(await this.#dressed(mail));
  }

  /** Whether email is sent in a way that can send a test. */
  async canTest(): Promise<boolean> {
    return sendsTests(await this.#mailer());
  }

  /**
   * Sends the test. What the provider said goes nowhere but into the words for the owner who
   * asked: which of the two things they typed to look at again.
   */
  async sendTest(mail: TestMail): Promise<void> {
    const mailer = await this.#mailer(mail.siteName);
    if (!sendsTests(mailer)) throw new ConflictError('No test email can be sent yet. Save an API key and a sender first.');
    try {
      await mailer.sendTest(await this.#dressed(mail));
    } catch (error) {
      if (!(error instanceof MailRefusedError)) throw new ConflictError('The email service could not be reached, so no test was sent. Try again in a moment.');
      const { status } = error;
      throw new ConflictError(
        status === 401
          ? 'Resend did not accept the API key (401). Check that it was pasted whole, and that it has not been deleted in Resend.'
          : status === 403
            ? 'Resend refused to send from this sender (403). Verify the sender\'s domain in Resend, and check that the API key may send email.'
            : status === 422
              ? 'Resend did not accept the sender (422). Use an address on a domain you have verified in Resend.'
              : status === 429
                ? 'Resend is turning email away for now (429): too many were sent, or the plan\'s limit is reached. Try again later.'
                : `Resend could not send the test (${status}). Try again in a moment.`,
      );
    }
  }

  /**
   * The email with the site called what an owner called it, and wearing the site's look. A name
   * or a look that cannot be read leaves the email as it was.
   */
  async #dressed<T extends { readonly siteName: string; readonly brand?: MailBrand }>(mail: T): Promise<T> {
    const [siteName, brand] = await Promise.all([this.#siteName(), this.#brand()]);
    return { ...mail, ...(siteName && { siteName }), ...(brand && { brand: { ...brand, ...mail.brand } }) };
  }

  #siteName(): Promise<string | null> {
    return this.#options.siteName?.().catch(() => null) ?? Promise.resolve(null);
  }

  async #brand(): Promise<MailBrand | null> {
    const { origin } = this.#options;
    const look = (await this.#options.brand?.().catch(() => null)) ?? {};
    const brand: MailBrand = {
      ...(origin !== undefined && { url: origin }),
      ...(origin !== undefined && look.logo !== undefined && { logo: mailImageUrl(origin, look.logo) }),
      ...(origin !== undefined && look.logo !== undefined && look.logoDark !== undefined && { logoDark: mailImageUrl(origin, look.logoDark) }),
      ...(look.color !== undefined && { color: look.color }),
    };
    return Object.keys(brand).length === 0 ? null : brand;
  }

  /** The name emails are sent under: the owner's sender name, else the site's. */
  async #senderName(siteName: string): Promise<string> {
    const saved = await this.#options.settings.senderName().catch(() => null);
    return saved ?? (await this.#siteName()) ?? siteName;
  }

  /** @param siteName What the email calls the site, for the sender's name when nothing else names it. */
  async #mailer(siteName?: string): Promise<Mailer | undefined> {
    return this.#options.own ?? (await this.#fromServer(siteName)) ?? (await this.#fromEditor(siteName));
  }

  /** The key and sender the server's environment sets, when it sets both. */
  #serverFrom(): { apiKey: string; from: string } | undefined {
    const env = this.#options.env ?? process.env;
    const apiKey = env['VELOCITY_CMS_RESEND_API_KEY'];
    const from = env['VELOCITY_CMS_EMAIL_FROM'];
    return apiKey && from ? { apiKey, from } : undefined;
  }

  async #fromServer(siteName = ''): Promise<ResendMailer | undefined> {
    const server = this.#serverFrom();
    if (!server) return undefined;
    // A sender the server names stays as it is; a bare address is sent under the site's name.
    const from = hasName(server.from) ? server.from : namedSender(server.from, await this.#senderName(siteName));
    return new ResendMailer({ apiKey: server.apiKey, from, ...(this.#options.fetch && { fetch: this.#options.fetch }) });
  }

  async #fromEditor(siteName = ''): Promise<ResendMailer | undefined> {
    const account = await this.#options.settings.mailAccount();
    if (account === null) return undefined;
    // The sender name an owner saved wins over a name typed into the address, then the site's name.
    const saved = await this.#options.settings.senderName().catch(() => null);
    const address = account.from.replace(/^.*<([^<>]+)>\s*$/, '$1').trim();
    const from = saved !== null ? namedSender(address, saved) : hasName(account.from) ? account.from : namedSender(account.from, (await this.#siteName()) ?? siteName);
    return new ResendMailer({ apiKey: account.apiKey, from, ...(this.#options.fetch && { fetch: this.#options.fetch }) });
  }
}
