import { ConflictError, type ChallengeAccount, type ChallengeProvider, type ChallengeRoom } from '@velocity-astro/cms-core';

/** Where Cloudflare Turnstile is asked whether an answer is a person's. The only address a check goes to. */
export const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** The host a page with a form loads the challenge from, for a site's content security policy (scripts and frames). */
export const TURNSTILE_HOST = 'https://challenges.cloudflare.com';
/** The script that draws the challenge. `render=explicit`: the form's own script says where. */
export const TURNSTILE_SCRIPT = `${TURNSTILE_HOST}/turnstile/v0/api.js?render=explicit`;
/** Where Google reCAPTCHA is asked whether an answer is a person's. The only address its checks go to. */
export const RECAPTCHA_VERIFY = 'https://www.google.com/recaptcha/api/siteverify';
/**
 * The hosts a page with a form loads reCAPTCHA from, for a site's content security policy
 * (scripts and frames): its script comes from the first and loads the rest from the second.
 */
export const RECAPTCHA_HOSTS = ['https://www.google.com', 'https://www.gstatic.com'] as const;
/** reCAPTCHA v3's script for a site key. It draws nothing but a small badge, and scores each sender. */
export const recaptchaScript = (siteKey: string): string => `${RECAPTCHA_HOSTS[0]}/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
/** Every host either challenge loads from, for a site that lists them in its policy once, whichever an owner chooses. */
export const CHALLENGE_HOSTS: readonly string[] = [TURNSTILE_HOST, ...RECAPTCHA_HOSTS];
/** The name Turnstile's answer is posted under. */
export const FORM_CHALLENGE_FIELD = 'cf-turnstile-response';
/** The name reCAPTCHA's answer is posted under, by the form's script. */
export const FORM_RECAPTCHA_FIELD = 'g-recaptcha-response';
/** What reCAPTCHA v3 is asked to score: the form's script names this action, and an answer for another is refused. */
export const RECAPTCHA_ACTION = 'cms_form';
/**
 * The lowest reCAPTCHA v3 score taken as a person's, on its scale from 0 (a bot) to 1. Google's
 * own advice is to start at 0.5. A sender under it is suspected, never refused.
 */
export const RECAPTCHA_PASSING_SCORE = 0.5;
/** Longer than any answer Turnstile or reCAPTCHA gives. */
const MAX_ANSWER_LENGTH = 8192;
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

const SERVICE: Readonly<Record<ChallengeProvider, { readonly verify: string; readonly name: string; readonly where: string }>> = {
  turnstile: { verify: TURNSTILE_VERIFY, name: 'Cloudflare Turnstile', where: "the widget's settings in Cloudflare, under Turnstile" },
  recaptcha: { verify: RECAPTCHA_VERIFY, name: 'Google reCAPTCHA', where: "the site's settings in the reCAPTCHA admin console" },
};

/**
 * Checks a form's sender with the challenge an owner set up (Cloudflare Turnstile, or Google
 * reCAPTCHA v3, which passes a sender whose score is at least `RECAPTCHA_PASSING_SCORE`). A sender who
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
    const verdict = await this.#ask(account, answer);
    const { name } = SERVICE[account.provider];
    if (verdict === 'wrong-secret') this.#options.onFault?.(new Error(`${name} does not know the secret key saved under Settings, Forms and spam, so forms are not being checked with it.`));
    if (verdict === 'unreachable') this.#options.onFault?.(new Error(`${name} could not be asked about a form's sender, so that post was not checked with it.`));
    return verdict !== 'not-a-person';
  }

  async test(): Promise<void> {
    const account = await this.#options.account();
    if (account === null) throw new ConflictError('There are no keys to check yet. Save the site key and the secret key first.');
    const verdict = await this.#ask(account, TEST_ANSWER);
    const service = account.provider === 'recaptcha' ? 'Google' : 'Cloudflare';
    if (verdict === 'wrong-secret') throw new ConflictError(`${service} does not know this secret key. Copy it again from ${SERVICE[account.provider].where}.`);
    if (verdict === 'unreachable') throw new ConflictError(`${service} could not be reached to check the key. Try again in a moment.`);
  }

  /** Asks the one address the service's checks go to. The visitor's own address is not sent along. */
  async #ask(account: ChallengeAccount, answer: string): Promise<Verdict> {
    const send = this.#options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    try {
      const response = await send(SERVICE[account.provider].verify, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: account.secretKey, response: answer }).toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null) return 'unreachable';
      const { success, 'error-codes': codes, score, action } = body as { success?: unknown; 'error-codes'?: unknown; score?: unknown; action?: unknown };
      if (success === true) {
        if (account.provider !== 'recaptcha') return 'person';
        // v3 passes every answer it can read, and says with a score how likely a person sent it.
        // An answer made for another action, or with no score (a v2 key's), is not this form's.
        return action === RECAPTCHA_ACTION && typeof score === 'number' && score >= RECAPTCHA_PASSING_SCORE ? 'person' : 'not-a-person';
      }
      const said = Array.isArray(codes) ? codes.filter((code): code is string => typeof code === 'string') : [];
      if (said.includes('invalid-input-secret') || said.includes('missing-input-secret')) return 'wrong-secret';
      if (said.includes('internal-error') || success !== false) return 'unreachable';
      return 'not-a-person';
    } catch {
      return 'unreachable';
    }
  }
}
