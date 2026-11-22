/**
 * How a site looks in its emails, from what its settings hold: its logo and its colour. Every
 * part may be missing, and an email is drawn without it. A mailer that draws its own emails may
 * ignore it.
 */
export interface MailBrand {
  /** The site's logo as a PNG, at a whole `https` address an email can load. */
  readonly logo?: string;
  /** The logo for a dark background, where the site has one. */
  readonly logoDark?: string;
  /** The site's colour, as `#rrggbb`: the accent and the button of every email. */
  readonly color?: string;
  /** The site's own address, for the foot of an email. */
  readonly url?: string;
}

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
  /** How the site looks, where the host knows. */
  readonly brand?: MailBrand;
}

/** Word to someone that they were let in. It carries no secret: they ask for a link themselves. */
export interface InvitationMail {
  readonly email: string;
  readonly name: string;
  /** The editor's address, where they ask for their first sign-in link. */
  readonly url: string;
  readonly siteName: string;
  /** The name of whoever invited them, where they are known. */
  readonly invitedBy?: string;
  readonly brand?: MailBrand;
}

/** A link that makes a new address someone's own, sent to that address. */
export interface EmailChangeMail {
  /** The new address, which the email goes to. */
  readonly email: string;
  readonly name: string;
  /** Opens the editor and makes the address theirs. Works once. */
  readonly url: string;
  readonly expiresInMinutes: number;
  readonly siteName: string;
  readonly brand?: MailBrand;
}

/**
 * Delivers sign-in links and invitations. A site supplies one for its email provider. It is only
 * ever called for someone who has an account, so it never needs to check. A mail that cannot be
 * sent is thrown, so the person waiting for it is told.
 */
export interface Mailer {
  sendSignInLink(mail: SignInMail): Promise<void>;
  sendInvitation(mail: InvitationMail): Promise<void>;
  /** Sends the link that confirms a new address. A mailer without it cannot change anyone's address. */
  sendEmailChange?(mail: EmailChangeMail): Promise<void>;
}

/**
 * A `Mailer` that keeps what it is given instead of sending it. For tests, and for local
 * development, where reading the link from `sent` stands in for opening an email.
 */
export class MemoryMailer implements Mailer {
  readonly sent: SignInMail[] = [];
  readonly invitations: InvitationMail[] = [];
  readonly emailChanges: EmailChangeMail[] = [];

  async sendSignInLink(mail: SignInMail): Promise<void> {
    this.sent.push(mail);
  }

  async sendInvitation(mail: InvitationMail): Promise<void> {
    this.invitations.push(mail);
  }

  async sendEmailChange(mail: EmailChangeMail): Promise<void> {
    this.emailChanges.push(mail);
  }
}
