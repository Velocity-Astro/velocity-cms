import { createCms, type Actor, type Cms } from '@velocity/cms-core';
import { FakeClock, InMemoryEntryRepository, InMemorySchemaRepository, SequentialIds } from '@velocity/cms-core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { FORM_LOCALE_FIELD, FORM_PAGE_FIELD, FORM_TOKEN_FIELD, FORM_TRAP_FIELD, FormPosts, MAX_FORM_POST_BYTES, MemoryRateLimiter, type FormPostsOptions, type SubmissionNotice } from './form-post.js';
import { ResendMailer } from './resend-mailer.js';

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const ORIGIN = 'https://lakeshore.example';
const SECRET = 'a-secret-of-at-least-thirty-two-characters';
const answers = { name: 'Ana Ruiz', email: 'Ana@Example.com', message: 'Is the house on Alder still for sale?' };

let cms: Cms;
let now: number;
let sent: SubmissionNotice[];
let faults: string[];

function posts(options: Partial<FormPostsOptions> = {}): FormPosts {
  return new FormPosts({
    cms,
    origin: ORIGIN,
    siteName: 'Lakeshore',
    secret: SECRET,
    mailer: { sendSubmissionNotice: async (mail) => void sent.push(mail) },
    now: () => now,
    onFault: (error) => void faults.push(error instanceof Error ? error.message : String(error)),
    ...options,
  });
}

/** A post as a page's plain form sends it, with a mark drawn three seconds before. */
async function filled(taker: FormPosts, fields: Record<string, string> = answers, extra: Record<string, string> = {}): Promise<URLSearchParams> {
  const token = await taker.token('contact');
  now += 3000;
  return new URLSearchParams({ ...fields, [FORM_PAGE_FIELD]: '/contact/', ...(token !== undefined && { [FORM_TOKEN_FIELD]: token }), ...extra });
}

const plain = (body: URLSearchParams, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/cms/submit/contact`, { method: 'POST', headers: { origin: ORIGIN, ...headers }, body });
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/cms/submit/contact`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const kept = async () => (await cms.submissions.find(owner)).items;

beforeEach(async () => {
  now = 1_800_000_000_000;
  sent = [];
  faults = [];
  cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
  await cms.forms.create(owner, {
    key: 'contact',
    label: { en: 'Contact us' },
    fields: [
      { key: 'name', type: 'text', label: { en: 'Your name' }, required: true },
      { key: 'email', type: 'email', label: { en: 'Email' }, required: true },
      { key: 'message', type: 'text', label: { en: 'Message', es: 'Mensaje' }, required: true, options: { multiline: true } },
      { key: 'updates', type: 'boolean', label: { en: 'Send me updates' } },
    ],
    notify: ['office@example.com', 'ben@example.com'],
    contact: { name: 'name', email: 'email' },
    success: { en: 'Thank you. We will be in touch.', es: 'Gracias.' },
  });
});

describe('a post from a page', () => {
  it('keeps what a plain form sends, thanks the visitor in the form\'s words and tells the form\'s people', async () => {
    const taker = posts();
    const response = await taker.handle(plain(await filled(taker, { ...answers, updates: 'on' })), 'contact', '203.0.113.9');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const html = await response.text();
    expect(html).toContain('Thank you. We will be in touch.');
    expect(html).toContain('href="/contact/"');

    const [submission] = await kept();
    expect(submission).toMatchObject({ status: 'new', email: 'ana@example.com', page: '/contact/' });
    expect(sent.map((mail) => mail.to)).toEqual(['office@example.com', 'ben@example.com']);
    expect(sent[0]).toMatchObject({ siteName: 'Lakeshore', formName: 'Contact us', page: `${ORIGIN}/contact/`, replyTo: 'ana@example.com' });
    expect(sent[0]?.answers).toEqual([
      { label: 'Your name', value: 'Ana Ruiz' },
      { label: 'Email', value: 'Ana@Example.com' },
      { label: 'Message', value: 'Is the house on Alder still for sale?' },
      { label: 'Send me updates', value: '✓' },
    ]);
  });

  it('answers a script with JSON, in the language the page said', async () => {
    const taker = posts();
    const body = Object.fromEntries(await filled(taker, answers, { [FORM_LOCALE_FIELD]: 'es' }));
    const response = await taker.handle(json(body), 'contact');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, message: 'Gracias.' });
    expect(sent[0]?.answers.map((answer) => answer.label)).toContain('Mensaje');
  });

  it('names each problem by field for a script, and keeps nothing', async () => {
    const taker = posts();
    const body = Object.fromEntries(await filled(taker, { name: 'Ana', email: 'not an address', message: '' }));
    const response = await taker.handle(json(body), 'contact');
    expect(response.status).toBe(422);
    const answer = (await response.json()) as { error: { code: string; issues: { path: string[]; message: string }[] } };
    expect(answer.error.code).toBe('validation_failed');
    expect(answer.error.issues.map((issue) => issue.path[0])).toEqual(['email', 'message']);
    expect(await kept()).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('shows a plain form its problems under the fields\' labels, and never what was typed', async () => {
    const taker = posts();
    const response = await taker.handle(plain(await filled(taker, { name: '<script>alert(1)</script>', email: '"><img src=x>', message: '' })), 'contact');
    expect(response.status).toBe(422);
    const html = await response.text();
    expect(html).toContain('Email:');
    expect(html).toContain('Message: This is needed.');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('img src');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('answers for a form that is closed or not there as it does for no form at all', async () => {
    const taker = posts();
    const missing = await taker.handle(new Request(`${ORIGIN}/api/cms/submit/nothing`, { method: 'POST', headers: { origin: ORIGIN, accept: 'application/json' }, body: await filled(taker) }), 'nothing');
    expect(missing.status).toBe(404);
    const [form] = await cms.forms.list(owner);
    if (!form) throw new Error('No form');
    await cms.forms.update(owner, form.id, { open: false, expectedRevision: form.revision });
    const closed = await taker.handle(plain(await filled(taker), { accept: 'application/json' }), 'contact');
    expect(closed.status).toBe(404);
    expect(await closed.json()).toEqual(await missing.json());
  });
});

describe('what keeps a form from being abused', () => {
  it('takes posts only', async () => {
    const response = await posts().handle(new Request(`${ORIGIN}/api/cms/submit/contact`), 'contact');
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('refuses a post that says it comes from another site', async () => {
    const taker = posts();
    const response = await taker.handle(plain(await filled(taker), { origin: 'https://elsewhere.example' }), 'contact');
    expect(response.status).toBe(403);
    expect(await kept()).toEqual([]);
  });

  it('keeps a post that filled in the hidden field as spam, tells nobody, and answers as if all were well', async () => {
    const taker = posts();
    const response = await taker.handle(plain(await filled(taker, answers, { [FORM_TRAP_FIELD]: 'https://spam.example' })), 'contact');
    expect(response.status).toBe(200);
    expect((await kept()).map((submission) => submission.status)).toEqual(['spam']);
    expect(sent).toEqual([]);
  });

  it('suspects a post with no mark, a forged mark, a mark for another form, or one sent at once', async () => {
    const taker = posts();
    const real = await taker.token('contact');
    const other = await taker.token('newsletter');
    now += 3000;
    const [drawn = ''] = (real ?? '').split('.');
    for (const token of [undefined, 'nonsense', `${drawn}.${'0'.repeat(64)}`, other]) {
      await taker.handle(json({ ...answers, ...(token !== undefined && { [FORM_TOKEN_FIELD]: token }) }), 'contact');
    }
    const fresh = await taker.token('contact');
    now += 200;
    await taker.handle(json({ ...answers, [FORM_TOKEN_FIELD]: fresh }), 'contact');
    expect((await kept()).map((submission) => submission.status)).toEqual(['spam', 'spam', 'spam', 'spam', 'spam']);
    expect(sent).toEqual([]);
  });

  it('takes a mark from a page drawn long ago, since pages are kept', async () => {
    const taker = posts();
    const token = await taker.token('contact');
    now += 30 * 24 * 60 * 60_000;
    await taker.handle(json({ ...answers, [FORM_TOKEN_FIELD]: token }), 'contact');
    expect((await kept()).map((submission) => submission.status)).toEqual(['new']);
  });

  it('has no time check on a site without a secret', async () => {
    const taker = posts({ secret: undefined });
    expect(await taker.token('contact')).toBeUndefined();
    await taker.handle(json(answers), 'contact');
    expect((await kept()).map((submission) => submission.status)).toEqual(['new']);
  });

  it('takes only so many from one address in a stretch of time', async () => {
    const taker = posts({ limiter: new MemoryRateLimiter(2, 60_000, () => now) });
    const statuses: number[] = [];
    for (let count = 0; count < 3; count += 1) statuses.push((await taker.handle(plain(await filled(taker)), 'contact', '203.0.113.9')).status);
    expect(statuses).toEqual([200, 200, 429]);
    expect((await taker.handle(plain(await filled(taker)), 'contact', '203.0.113.10')).status).toBe(200);
    now += 60_000;
    expect((await taker.handle(plain(await filled(taker)), 'contact', '203.0.113.9')).status).toBe(200);
  });

  it('refuses a body over the limit, whatever it says its length is, and one that is not a form', async () => {
    const taker = posts();
    const large = await taker.handle(json({ ...answers, message: 'x'.repeat(MAX_FORM_POST_BYTES) }), 'contact');
    expect(large.status).toBe(413);
    const odd = await taker.handle(new Request(`${ORIGIN}/api/cms/submit/contact`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello' }), 'contact');
    expect(odd.status).toBe(415);
    const broken = await taker.handle(new Request(`${ORIGIN}/api/cms/submit/contact`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '[1,2' }), 'contact');
    expect(broken.status).toBe(415);
    expect(await kept()).toEqual([]);
  });

  it('keeps only a page of the site as where a post came from', async () => {
    const taker = posts();
    await taker.handle(plain(await filled(taker, answers, { [FORM_PAGE_FIELD]: '//elsewhere.example/x' })), 'contact');
    const [submission] = await kept();
    expect(submission?.page).toBeUndefined();
    expect(sent[0]?.page).toBeUndefined();
  });
});

describe('notices', () => {
  it('keeps the submission when a notice cannot be sent, and reports the fault without what was written', async () => {
    const taker = posts({ mailer: { sendSubmissionNotice: async () => Promise.reject(new Error('Resend refused an email (403).')) } });
    const response = await taker.handle(plain(await filled(taker)), 'contact');
    expect(response.status).toBe(200);
    expect(await kept()).toHaveLength(1);
    expect(faults).toHaveLength(2);
    expect(faults.join(' ')).toContain('Resend refused an email (403).');
    expect(faults.join(' ')).not.toMatch(/Ana|Alder|example\.com/);
  });

  it('says so once when a form has people to tell and the site has no way to email', async () => {
    const taker = posts({ mailer: undefined });
    await taker.handle(plain(await filled(taker)), 'contact');
    expect(await kept()).toHaveLength(1);
    expect(faults).toEqual([expect.stringContaining('no email provider is set up')]);
  });

  it('are sent through Resend with every answer as text and a reply going to the sender', async () => {
    const mails: { to: string[]; subject: string; html: string; text: string; reply_to?: string }[] = [];
    const mailer = new ResendMailer({
      apiKey: 're_test',
      from: 'Lakeshore <cms@lakeshore.example>',
      fetch: async (_input, init) => {
        mails.push(JSON.parse(String(init?.body)) as never);
        return new Response('{"id":"1"}');
      },
    });
    const taker = posts({ mailer });
    await taker.handle(plain(await filled(taker, { ...answers, message: 'Line one\n<a href="https://spam.example">click</a>' })), 'contact');
    const [mail] = mails;
    expect(mail).toMatchObject({ to: ['office@example.com'], subject: 'New message: Contact us on Lakeshore', reply_to: 'ana@example.com' });
    expect(mail?.html).toContain('Line one<br>&#60;a href=');
    expect(mail?.html).not.toContain('<a href');
    expect(mail?.text).toContain('Message:\nLine one');
    expect(mail?.text).toContain(`Sent from ${ORIGIN}/contact/`);
  });
});
