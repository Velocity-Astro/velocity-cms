import type { EmailChangeMail, InvitationMail, MailBrand, Mailer, SignInMail } from '@velocity-astro/cms-auth';
import { renderEmail } from './email-layout.js';
import type { NoticeMailer, SubmissionNotice } from './form-post.js';

/** The words of the emails. Give your own to send them in another language. */
export interface MailWords {
  readonly signInSubject: (siteName: string) => string;
  readonly signInGreeting: (name: string) => string;
  readonly signInBody: (siteName: string, minutes: number) => string;
  readonly signInButton: string;
  readonly signInIgnore: string;
  readonly invitationSubject: (siteName: string) => string;
  readonly invitationGreeting: (name: string) => string;
  readonly invitationBody: (siteName: string, email: string) => string;
  readonly invitationButton: string;
  /** The notice that a form was filled in. Left out, these are in English. */
  readonly noticeSubject?: (formName: string, siteName: string) => string;
  readonly noticeIntro?: (formName: string, siteName: string) => string;
  readonly noticeSentFrom?: string;
  readonly noticeReply?: string;
  /** The email an owner asks for to see that the settings work. Left out, these are in English. */
  readonly testSubject?: (siteName: string) => string;
  readonly testGreeting?: (name: string) => string;
  readonly testBody?: (siteName: string) => string;
  /**
   * The heading of each email, the line an inbox shows beside the subject, and why the address
   * was sent it, at its foot. Left out, these are in English.
   */
  readonly signInHeading?: (siteName: string) => string;
  readonly signInPreview?: (minutes: number) => string;
  readonly signInReason?: (siteName: string) => string;
  readonly invitationHeading?: (siteName: string) => string;
  /** The heading when whoever invited them is known. */
  readonly invitationHeadingBy?: (inviter: string, siteName: string) => string;
  readonly invitationPreview?: (siteName: string) => string;
  readonly invitationReason?: (siteName: string) => string;
  readonly noticeHeading?: (formName: string) => string;
  readonly noticeButton?: string;
  readonly noticeReason?: (formName: string) => string;
  readonly emailChangeSubject?: (siteName: string) => string;
  readonly emailChangeHeading?: string;
  readonly emailChangeBody?: (siteName: string, minutes: number) => string;
  readonly emailChangeButton?: string;
  readonly emailChangeIgnore?: string;
  readonly emailChangeReason?: (siteName: string) => string;
  readonly testHeading?: string;
  readonly testReason?: (siteName: string) => string;
  /** Under a button, for a client that shows none. */
  readonly buttonFallback?: string;
}

export const englishMailWords: MailWords = {
  signInSubject: (siteName) => `Your sign-in link for ${siteName}`,
  signInGreeting: (name) => `Hi ${name},`,
  signInBody: (siteName, minutes) => `Use the button below to sign in to ${siteName}. The link works once and expires in ${minutes} minutes.`,
  signInButton: 'Sign in',
  signInIgnore: 'If you did not ask for this, you can ignore this email. Nobody can sign in without the link.',
  invitationSubject: (siteName) => `You can now edit ${siteName}`,
  invitationGreeting: (name) => `Hi ${name},`,
  invitationBody: (siteName, email) =>
    `You have been invited to edit ${siteName}. Open the editor and enter ${email}: a sign-in link will be emailed to you. There is no password to set.`,
  invitationButton: 'Open the editor',
  noticeSubject: (formName, siteName) => `New message: ${formName} on ${siteName}`,
  noticeIntro: (formName, siteName) => `Someone filled in "${formName}" on ${siteName}.`,
  noticeSentFrom: 'Sent from',
  noticeReply: 'Reply to this email to answer them. The message is also kept in the CMS.',
  testSubject: (siteName) => `Email works for ${siteName}`,
  testGreeting: (name) => `Hi ${name},`,
  testBody: (siteName) => `This is a test from ${siteName}. If you are reading it, sign-in links, invitations and notices from forms will arrive too.`,
  signInHeading: (siteName) => `Sign in to ${siteName}`,
  signInPreview: (minutes) => `Your link works once, for ${minutes} minutes.`,
  signInReason: (siteName) => `You got this email because a sign-in link for ${siteName} was asked for with this address.`,
  invitationHeading: (siteName) => `You're invited to edit ${siteName}`,
  invitationHeadingBy: (inviter, siteName) => `${inviter} invited you to edit ${siteName}`,
  invitationPreview: (siteName) => `Open the editor of ${siteName} and ask for your sign-in link.`,
  invitationReason: (siteName) => `You got this email because an owner of ${siteName} invited this address to edit it.`,
  noticeHeading: (formName) => `New message from "${formName}"`,
  noticeButton: 'Open in the editor',
  noticeReason: (formName) => `You got this email because this address is told of what is sent with the form "${formName}".`,
  emailChangeSubject: (siteName) => `Confirm your new email address for ${siteName}`,
  emailChangeHeading: 'Confirm your new address',
  emailChangeBody: (siteName, minutes) => `You asked to sign in to ${siteName} with this address. Open the link below while signed in to the editor to make it yours. It works once, for ${minutes} minutes.`,
  emailChangeButton: 'Confirm this address',
  emailChangeIgnore: 'If you did not ask for this, ignore this email: nothing changes until the link is opened.',
  emailChangeReason: (siteName) => `You got this email because this address was given as a new one on a profile in ${siteName}.`,
  testHeading: 'Email is working',
  testReason: (siteName) => `You got this email because you asked for a test in the settings of ${siteName}.`,
  buttonFallback: 'If the button does not work, copy this address into your browser:',
};

export interface ResendMailerOptions {
  /** A Resend API key that may send email. */
  readonly apiKey: string;
  /** Who the emails come from, on a domain verified with Resend: `Lakeshore Realty <cms@lakeshore.example>`. */
  readonly from: string;
  readonly words?: MailWords;
  /** Defaults to the platform's own `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

/** A test email to send: to the person who asked for it. */
export interface TestMail {
  readonly email: string;
  readonly name: string;
  readonly siteName: string;
  readonly brand?: MailBrand;
}

/** The provider answered and refused. `status` is its answer; the message holds its own words, for the server's log. */
export class MailRefusedError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Resend refused an email (${status}). ${detail}`);
  }
}

/**
 * Sends the CMS's emails through Resend, over plain HTTP: no SDK, so it runs wherever the site
 * does. A site that uses another provider writes its own `Mailer` the same way.
 */
export class ResendMailer implements Mailer, NoticeMailer {
  readonly #options: ResendMailerOptions;
  readonly #words: MailWords;

  constructor(options: ResendMailerOptions) {
    this.#options = options;
    this.#words = options.words ?? englishMailWords;
  }

  sendSignInLink(mail: SignInMail): Promise<void> {
    const words = { ...englishMailWords, ...this.#words };
    const subject = words.signInSubject(mail.siteName);
    return this.#send(
      mail.email,
      subject,
      renderEmail({
        siteName: mail.siteName,
        brand: mail.brand,
        subject,
        preview: words.signInPreview?.(mail.expiresInMinutes) ?? '',
        heading: words.signInHeading?.(mail.siteName) ?? subject,
        paragraphs: [words.signInGreeting(mail.name), words.signInBody(mail.siteName, mail.expiresInMinutes)],
        button: { label: words.signInButton, url: mail.url, fallback: words.buttonFallback },
        notes: [words.signInIgnore],
        reason: words.signInReason?.(mail.siteName) ?? '',
      }),
    );
  }

  sendInvitation(mail: InvitationMail): Promise<void> {
    const words = { ...englishMailWords, ...this.#words };
    const subject = words.invitationSubject(mail.siteName);
    return this.#send(
      mail.email,
      subject,
      renderEmail({
        siteName: mail.siteName,
        brand: mail.brand,
        subject,
        preview: words.invitationPreview?.(mail.siteName) ?? '',
        heading: (mail.invitedBy !== undefined ? words.invitationHeadingBy?.(mail.invitedBy, mail.siteName) : undefined) ?? words.invitationHeading?.(mail.siteName) ?? subject,
        paragraphs: [words.invitationGreeting(mail.name), words.invitationBody(mail.siteName, mail.email)],
        button: { label: words.invitationButton, url: mail.url, fallback: words.buttonFallback },
        reason: words.invitationReason?.(mail.siteName) ?? '',
      }),
    );
  }

  sendEmailChange(mail: EmailChangeMail): Promise<void> {
    const words = { ...englishMailWords, ...this.#words };
    const subject = words.emailChangeSubject?.(mail.siteName) ?? mail.siteName;
    const body = words.emailChangeBody?.(mail.siteName, mail.expiresInMinutes) ?? '';
    return this.#send(
      mail.email,
      subject,
      renderEmail({
        siteName: mail.siteName,
        brand: mail.brand,
        subject,
        preview: body,
        heading: words.emailChangeHeading ?? subject,
        paragraphs: [words.signInGreeting(mail.name), body],
        button: { label: words.emailChangeButton ?? subject, url: mail.url, fallback: words.buttonFallback },
        notes: words.emailChangeIgnore === undefined ? [] : [words.emailChangeIgnore],
        reason: words.emailChangeReason?.(mail.siteName) ?? '',
      }),
    );
  }

  /** One email that says the settings work. It carries no link and no secret. */
  sendTest(mail: TestMail): Promise<void> {
    const words = { ...englishMailWords, ...this.#words };
    const subject = words.testSubject?.(mail.siteName) ?? mail.siteName;
    const body = words.testBody?.(mail.siteName) ?? '';
    return this.#send(
      mail.email,
      subject,
      renderEmail({
        siteName: mail.siteName,
        brand: mail.brand,
        subject,
        preview: body,
        heading: words.testHeading ?? subject,
        paragraphs: [words.testGreeting?.(mail.name) ?? '', body].filter((words) => words !== ''),
        reason: words.testReason?.(mail.siteName) ?? '',
      }),
    );
  }

  sendSubmissionNotice(mail: SubmissionNotice): Promise<void> {
    const words = { ...englishMailWords, ...this.#words };
    const subject = words.noticeSubject?.(mail.formName, mail.siteName) ?? mail.formName;
    const intro = words.noticeIntro?.(mail.formName, mail.siteName) ?? '';
    const from = mail.page === undefined ? undefined : `${words.noticeSentFrom ?? ''} ${mail.page}`;
    const note = mail.replyTo === undefined ? undefined : words.noticeReply;
    // Everything a visitor wrote is escaped and shown as text by the layout: a notice never
    // carries their markup or a link of theirs.
    const email = renderEmail({
      siteName: mail.siteName,
      brand: mail.brand,
      subject,
      preview: intro,
      heading: words.noticeHeading?.(mail.formName) ?? subject,
      paragraphs: [intro],
      details: mail.answers,
      ...(mail.inbox !== undefined && words.noticeButton !== undefined && { button: { label: words.noticeButton, url: mail.inbox } }),
      notes: [from, note].filter((text) => text !== undefined),
      reason: words.noticeReason?.(mail.formName) ?? '',
    });
    return this.#send(mail.to, subject, email, mail.replyTo);
  }

  async #send(to: string, subject: string, body: { html: string; text: string }, replyTo?: string): Promise<void> {
    const send = this.#options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    const response = await send('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.#options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.#options.from, to: [to], subject, ...body, ...(replyTo !== undefined && { reply_to: replyTo }) }),
    });
    if (!response.ok) {
      // The provider's own words go to the server's log through whoever catches this. The address
      // is left out: a log is not the place for who works on a site.
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new MailRefusedError(response.status, detail);
    }
  }
}

/**
 * The mailer a site gets from its settings alone: Resend when `VELOCITY_CMS_RESEND_API_KEY` and
 * `VELOCITY_CMS_EMAIL_FROM` are both set, otherwise none.
 */
export function mailerFromEnv(env: Readonly<Record<string, string | undefined>> = process.env, fetch?: typeof globalThis.fetch): ResendMailer | undefined {
  const apiKey = env['VELOCITY_CMS_RESEND_API_KEY'];
  const from = env['VELOCITY_CMS_EMAIL_FROM'];
  return apiKey && from ? new ResendMailer({ apiKey, from, ...(fetch && { fetch }) }) : undefined;
}
