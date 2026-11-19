import { ConflictError, type ChallengeAccount, type ChallengeRoom } from '@velocity-astro/cms-core';

/** Where Cloudflare Turnstile is asked whether an answer is a person's. The only address a check goes to. */
export const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** The host a page with a form loads the challenge from, for a site's content security policy (scripts and frames). */
export const TURNSTILE_HOST = 'https://challenges.cloudflare.com';
/** The script that draws the challenge. `render=explicit`: the form's own script says where. */
export const TURNSTILE_SCRIPT = `${TURNSTILE_HOST}/turnstile/v0/api.js?render=explicit`;
/** The name the challenge's answer is posted under. */
export const FORM_CHALLENGE_FIELD = 'cf-turnstile-response';
/** The longest answer Turnstile gives. */
const MAX_ANSWER_LENGTH = 2048;
/** What a test sends in place of a person's answer. Cloudflare refuses it, and says first whether it knows the key. */
const TEST_ANSWER = 'velocity-cms-key-check';

/** Says whether what a post carries shows its sender passed the challenge. */
export interface ChallengeCheck {
  /** True when the sender passed, and when the site asks for no challenge. */
  passed(answer: unknown): Promise<boolean>;
}

export interface SiteChallengeOptions {
  /** The challenge an owner set up in the editor's settings, read for each post. */
  readonly account: () => Promise<ChallengeAccount | null>;
  /** Defaults to the platform's own `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  /** Told when the challenge service could not be asked. Never given what a visitor sent. */
  readonly onFault?: (error: unknown) => void;
}

type Verdict = 'person' | 'not-a-person' | 'wrong-secret' | 'unreachable';

/**
 * Checks a form's sender with the challenge an owner set up (Cloudflare Turnstile). A sender who
 * did not pass is suspected, and what they sent is kept as spam like any other suspected post.
 * A service that cannot be asked, or that does not know the site's key, is never held against a
 * visitor: the other checks still stand, and the fault is told to the log.
 */
export class SiteChallenge implements ChallengeCheck, ChallengeRoom {
  readonly #options: SiteChallengeOptions;

  constructor(options: SiteChallengeOptions) {
    this.#options = options;
  }

  async passed(answer: unknown): Promise<boolean> {
    let account: ChallengeAccount | null;
    try {
      account = await this.#options.account();
    } catch (error) {
      this.#options.onFault?.(error);
      return true;
    }
    if (account === null) return true;
    if (typeof answer !== 'string' || answer === '' || answer.length > MAX_ANSWER_LENGTH) return false;
    const verdict = await this.#ask(account.secretKey, answer);
    if (verdict === 'wrong-secret') this.#options.onFault?.(new Error('Cloudflare Turnstile does not know the secret key saved under Settings, Forms and spam, so forms are not being checked with it.'));
    if (verdict === 'unreachable') this.#options.onFault?.(new Error('Cloudflare Turnstile could not be asked about a form\'s sender, so that post was not checked with it.'));
    return verdict !== 'not-a-person';
  }

  async test(): Promise<void> {
    const account = await this.#options.account();
    if (account === null) throw new ConflictError('There are no keys to check yet. Save the site key and the secret key first.');
    const verdict = await this.#ask(account.secretKey, TEST_ANSWER);
    if (verdict === 'wrong-secret') throw new ConflictError('Cloudflare does not know this secret key. Copy it again from the widget\'s settings in Cloudflare, under Turnstile.');
    if (verdict === 'unreachable') throw new ConflictError('Cloudflare could not be reached to check the key. Try again in a moment.');
  }

  /** Asks the one address checks go to. The visitor's own address is not sent along. */
  async #ask(secret: string, answer: string): Promise<Verdict> {
    const send = this.#options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    try {
      const response = await send(TURNSTILE_VERIFY, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: answer }).toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null) return 'unreachable';
      const { success, 'error-codes': codes } = body as { success?: unknown; 'error-codes'?: unknown };
      if (success === true) return 'person';
      const said = Array.isArray(codes) ? codes.filter((code): code is string => typeof code === 'string') : [];
      if (said.includes('invalid-input-secret') || said.includes('missing-input-secret')) return 'wrong-secret';
      if (said.includes('internal-error') || success !== false) return 'unreachable';
      return 'not-a-person';
    } catch {
      return 'unreachable';
    }
  }
}
