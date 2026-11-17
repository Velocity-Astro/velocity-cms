/** One sign-in link to deliver. */
export interface SignInMail {
  readonly email: string;
  /** The person's name, for the greeting. */
  readonly name: string;
  /** Opens the editor, signed in. Works once. */
  readonly url: string;
  /** How long the link works for, to say so in the email. */
  readonly expiresInMinutes: number;
  /** The site's name, for the subject line. */
  readonly siteName: string;
}

/**
 * Delivers sign-in links. A site supplies one for its email provider. It is only ever called
 * for someone who has an account, so it never needs to check.
 */
export interface Mailer {
  sendSignInLink(mail: SignInMail): Promise<void>;
}

/**
 * A `Mailer` that keeps what it is given instead of sending it. For tests, and for local
 * development, where reading the link from `sent` stands in for opening an email.
 */
export class MemoryMailer implements Mailer {
  readonly sent: SignInMail[] = [];

  async sendSignInLink(mail: SignInMail): Promise<void> {
    this.sent.push(mail);
  }
}
