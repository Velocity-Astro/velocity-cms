import { ConflictError, type ChallengeAccount } from '@velocity-astro/cms-core';
import { describe, expect, it } from 'vitest';
import { SiteChallenge, TURNSTILE_VERIFY } from './challenge.js';

const account: ChallengeAccount = { provider: 'turnstile', siteKey: '0x4AAAAAAAsitekey', secretKey: '0x4AAAAAAAsecretkey' };

/** Cloudflare, answering each check with the next of `answers`. Keeps what it was asked. */
function cloudflare(...answers: (unknown | Error)[]) {
  const asked: { url: string; body: URLSearchParams; redirect: string | undefined }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    asked.push({ url: String(input), body: new URLSearchParams(String(init?.body)), redirect: init?.redirect });
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return typeof answer === 'string' ? new Response(answer, { status: 502 }) : Response.json(answer);
  };
  return { fetch, asked };
}

function challenge(service: ReturnType<typeof cloudflare>, saved: ChallengeAccount | null = account) {
  const faults: string[] = [];
  const check = new SiteChallenge({ account: async () => saved, fetch: service.fetch, onFault: (error) => void faults.push(error instanceof Error ? error.message : String(error)) });
  return { check, faults };
}

describe('SiteChallenge', () => {
  it('asks nobody and passes every sender while no challenge is set up', async () => {
    const service = cloudflare();
    const { check } = challenge(service, null);
    expect(await check.passed(undefined)).toBe(true);
    expect(service.asked).toEqual([]);
  });

  it('asks Cloudflare, and only Cloudflare, about an answer, without the visitor\'s address', async () => {
    const service = cloudflare({ success: true }, { success: false, 'error-codes': ['invalid-input-response'] }, { success: false, 'error-codes': ['timeout-or-duplicate'] });
    const { check, faults } = challenge(service);
    expect(await check.passed('an-answer')).toBe(true);
    expect(await check.passed('made-up')).toBe(false);
    expect(await check.passed('used-before')).toBe(false);
    expect(service.asked.map((ask) => ask.url)).toEqual([TURNSTILE_VERIFY, TURNSTILE_VERIFY, TURNSTILE_VERIFY]);
    expect(service.asked[0]?.redirect).toBe('error');
    expect([...(service.asked[0]?.body ?? [])]).toEqual([
      ['secret', account.secretKey],
      ['response', 'an-answer'],
    ]);
    expect(faults).toEqual([]);
  });

  it('does not pass a post with no answer, or one too long to be an answer, and asks nobody about it', async () => {
    const service = cloudflare();
    const { check } = challenge(service);
    for (const answer of [undefined, '', 7, ['x'], 'x'.repeat(2049)]) expect(await check.passed(answer)).toBe(false);
    expect(service.asked).toEqual([]);
  });

  it('never holds a service that cannot be asked, or a key it does not know, against a visitor, and tells the log without the answer', async () => {
    const service = cloudflare(new Error('socket hang up'), 'Bad gateway', { success: false, 'error-codes': ['internal-error'] }, { success: false, 'error-codes': ['invalid-input-secret'] });
    const { check, faults } = challenge(service);
    for (let count = 0; count < 4; count += 1) expect(await check.passed('the-visitors-answer')).toBe(true);
    expect(faults).toHaveLength(4);
    expect(faults[3]).toContain('does not know the secret key');
    expect(faults.join(' ')).not.toContain('the-visitors-answer');
    expect(faults.join(' ')).not.toContain(account.secretKey);
  });

  it('checks the keys: fine when Cloudflare knows the secret key, with words for the owner when it does not or cannot be reached', async () => {
    const service = cloudflare({ success: false, 'error-codes': ['invalid-input-response'] }, { success: false, 'error-codes': ['invalid-input-secret'] }, new Error('offline'));
    const { check } = challenge(service);
    await expect(check.test()).resolves.toBeUndefined();
    await expect(check.test()).rejects.toThrow(/does not know this secret key/);
    await expect(check.test()).rejects.toThrow(/could not be reached/);
    await expect(challenge(cloudflare(), null).check.test()).rejects.toBeInstanceOf(ConflictError);
  });
});
