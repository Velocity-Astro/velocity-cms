import { ConflictError, type Actor, type Cms, type MailFixedBy, type MailRoom, type SettingFixedBy, type StorageKeeping, type StorageRoom, type ChallengeRoom } from '@velocity-astro/cms-core';

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

  /** The site's code and its host send their own way; a server here leaves the name open. */
  namesSender(): MailFixedBy | null {
    return this.fixed === 'code' || this.fixed === 'host' ? this.fixed : null;
  }

  async canTest(): Promise<boolean> {
    return this.fixed !== null || (await this.settings.mailAccount()) !== null;
  }

  async sendTest(actor: Actor): Promise<void> {
    if (this.refuseWith !== null) throw new ConflictError(this.refuseWith);
    this.tests.push(actor.id);
  }
}

/**
 * How uploads are kept on a site that has no server: no bucket is ever reached, and each test
 * of one is counted in `tests`. Uploads go to "the disk" until the settings name a bucket.
 */
export class MemoryStorageRoom implements StorageRoom {
  /** How many times a test of the bucket was asked for. */
  tests = 0;
  /** Set to have something other than the editor's settings decide where uploads are kept. */
  fixed: SettingFixedBy | null = null;
  /** Set to have the storage service refuse the next tests with these words. */
  refuseWith: string | null = null;

  constructor(
    private readonly settings: Cms['settings'],
    /** Whether the site has a disk to keep uploads on. */
    private readonly hasDisk: boolean,
  ) {}

  fixedBy(): SettingFixedBy | null {
    return this.fixed;
  }

  async keeping(): Promise<StorageKeeping> {
    if (this.fixed !== null) return 'bucket';
    return (await this.settings.bucketAccount()) !== null ? 'bucket' : this.hasDisk ? 'folder' : 'none';
  }

  async test(): Promise<void> {
    if (this.refuseWith !== null) throw new ConflictError(this.refuseWith);
    this.tests += 1;
  }
}

/** The challenge service on a site that has no server: it is never reached, and each check of the keys is counted in `tests`. */
export class MemoryChallengeRoom implements ChallengeRoom {
  /** How many times a check of the keys was asked for. */
  tests = 0;
  /** Set to have the challenge service refuse the next checks with these words. */
  refuseWith: string | null = null;

  async test(): Promise<void> {
    if (this.refuseWith !== null) throw new ConflictError(this.refuseWith);
    this.tests += 1;
  }
}
