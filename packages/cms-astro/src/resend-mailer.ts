import type { InvitationMail, Mailer, SignInMail } from '@velocity/cms-auth';

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

const escaped = (text: string) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/** One paragraph of greeting, one of explanation, one button, and the address in full under it. */
function layout(greeting: string, body: string, button: string, url: string, note?: string): { html: string; text: string } {
  const paragraph = (words: string) => `<p style="margin:0 0 16px;font:16px/1.5 system-ui,sans-serif;color:#1a1a1a">${escaped(words)}</p>`;
  const html = [
    '<div style="max-width:480px;margin:0 auto;padding:32px 16px">',
    paragraph(greeting),
    paragraph(body),
    `<p style="margin:0 0 24px"><a href="${escaped(url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#111;color:#fff;font:600 16px system-ui,sans-serif;text-decoration:none">${escaped(button)}</a></p>`,
    `<p style="margin:0 0 16px;font:13px/1.5 system-ui,sans-serif;color:#666;word-break:break-all">${escaped(url)}</p>`,
    note === undefined ? '' : `<p style="margin:0;font:13px/1.5 system-ui,sans-serif;color:#666">${escaped(note)}</p>`,
    '</div>',
  ].join('');
  const text = [greeting, body, url, ...(note === undefined ? [] : [note])].join('\n\n');
  return { html, text };
}

/**
 * Sends the CMS's emails through Resend, over plain HTTP: no SDK, so it runs wherever the site
 * does. A site that uses another provider writes its own `Mailer` the same way.
 */
export class ResendMailer implements Mailer {
  readonly #options: ResendMailerOptions;
  readonly #words: MailWords;

  constructor(options: ResendMailerOptions) {
    this.#options = options;
    this.#words = options.words ?? englishMailWords;
  }

  sendSignInLink(mail: SignInMail): Promise<void> {
    const words = this.#words;
    return this.#send(
      mail.email,
      words.signInSubject(mail.siteName),
      layout(words.signInGreeting(mail.name), words.signInBody(mail.siteName, mail.expiresInMinutes), words.signInButton, mail.url, words.signInIgnore),
    );
  }

  sendInvitation(mail: InvitationMail): Promise<void> {
    const words = this.#words;
    return this.#send(
      mail.email,
      words.invitationSubject(mail.siteName),
      layout(words.invitationGreeting(mail.name), words.invitationBody(mail.siteName, mail.email), words.invitationButton, mail.url),
    );
  }

  async #send(to: string, subject: string, body: { html: string; text: string }): Promise<void> {
    const send = this.#options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    const response = await send('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.#options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.#options.from, to: [to], subject, ...body }),
    });
    if (!response.ok) {
      // The provider's own words go to the server's log through whoever catches this. The address
      // is left out: a log is not the place for who works on a site.
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`Resend refused an email (${response.status}). ${detail}`);
    }
  }
}

/**
 * The mailer a site gets from its settings alone: Resend when `VELOCITY_CMS_RESEND_API_KEY` and
 * `VELOCITY_CMS_EMAIL_FROM` are both set, otherwise none.
 */
export function mailerFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): Mailer | undefined {
  const apiKey = env['VELOCITY_CMS_RESEND_API_KEY'];
  const from = env['VELOCITY_CMS_EMAIL_FROM'];
  return apiKey && from ? new ResendMailer({ apiKey, from }) : undefined;
}
