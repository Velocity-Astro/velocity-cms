import { ConflictError, type Actor, type Cms, type MailFixedBy, type MailRoom } from '@velocity-astro/cms-core';

/**
 * How email leaves a site that has no server: nothing is sent, and each test asked for is kept
 * in `tests`. A test can be sent once the settings hold a key and a sender, as on a real site.
 */
export class MemoryMailRoom implements MailRoom {
  /** Who asked for a test email, in order. */
  readonly tests: string[] = [];
  /** Set to have something other than the editor's settings decide how email is sent. */
  fixed: MailFixedBy | null = null;
  /** Set to have the email service refuse the next tests with these words. */
  refuseWith: string | null = null;

  constructor(private readonly settings: Cms['settings']) {}

  fixedBy(): MailFixedBy | null {
    return this.fixed;
  }

  async canTest(): Promise<boolean> {
    return this.fixed !== null || (await this.settings.mailAccount()) !== null;
  }

  async sendTest(actor: Actor): Promise<void> {
    if (this.refuseWith !== null) throw new ConflictError(this.refuseWith);
    this.tests.push(actor.id);
  }
}
