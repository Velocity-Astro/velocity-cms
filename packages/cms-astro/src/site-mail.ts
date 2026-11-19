import type { InvitationMail, Mailer, SignInMail } from '@velocity-astro/cms-auth';
import { ConflictError, type Cms, type MailFixedBy } from '@velocity-astro/cms-core';
import type { NoticeMailer, SubmissionNotice } from './form-post.js';
import { MailRefusedError, ResendMailer, mailerFromEnv, type TestMail } from './resend-mailer.js';

export interface SiteMailOptions {
  /** The site's settings, where an owner may have said how email is sent. */
  readonly settings: Cms['settings'];
  /** The site's own mailer, from its code (`velocityCms({ mailer })`). It wins over everything. */
  readonly own?: Mailer | undefined;
  /** What sign-in links go to when nothing sends email: the server's log. */
  readonly fallback: Mailer;
  /** Whether a host runs this site among many, so what is fixed is fixed by the host. */
  readonly hosted?: boolean;
  /** Defaults to the server's own environment. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Defaults to the platform's own `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

type Tester = { sendTest(mail: TestMail): Promise<void> };

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
    const fixed = this.#options.own ? 'code' : this.#fromServer() ? 'server' : null;
    return fixed !== null && this.#options.hosted === true ? 'host' : fixed;
  }

  async sendSignInLink(mail: SignInMail): Promise<void> {
    await ((await this.#mailer()) ?? this.#options.fallback).sendSignInLink(mail);
  }

  async sendInvitation(mail: InvitationMail): Promise<void> {
    await ((await this.#mailer()) ?? this.#options.fallback).sendInvitation(mail);
  }

  /** A notice goes through the site's own mailer when it sends notices, and otherwise as the settings say. */
  async sendSubmissionNotice(mail: SubmissionNotice): Promise<void> {
    const { own } = this.#options;
    const mailer = takesNotices(own) ? own : (this.#fromServer() ?? (await this.#fromEditor()));
    if (!mailer) throw new Error('No email provider is set up. Set one up under Settings, Email in the editor.');
    await mailer.sendSubmissionNotice(mail);
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
    const mailer = await this.#mailer();
    if (!sendsTests(mailer)) throw new ConflictError('No test email can be sent yet. Save an API key and a sender first.');
    try {
      await mailer.sendTest(mail);
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

  async #mailer(): Promise<Mailer | undefined> {
    return this.#options.own ?? this.#fromServer() ?? (await this.#fromEditor());
  }

  #fromServer(): ResendMailer | undefined {
    return mailerFromEnv(this.#options.env, this.#options.fetch);
  }

  async #fromEditor(): Promise<ResendMailer | undefined> {
    const account = await this.#options.settings.mailAccount();
    if (account === null) return undefined;
    return new ResendMailer({ apiKey: account.apiKey, from: account.from, ...(this.#options.fetch && { fetch: this.#options.fetch }) });
  }
}
