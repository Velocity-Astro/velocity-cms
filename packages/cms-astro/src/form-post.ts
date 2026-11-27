import type { MailBrand } from '@velocity-astro/cms-auth';
import { FORM_CHALLENGE_FIELD, FORM_RECAPTCHA_FIELD, type ChallengeCheck } from './challenge.js';
import { NotFoundError, ValidationError, liveFields, type Cms, type DealSubject, type FormDef, type LocalizedText, type Submission } from '@velocity-astro/cms-core';

/** The names a form's page sends beside its own fields. A field's key never starts with `_`. */
export const FORM_TRAP_FIELD = '_hp';
export const FORM_TOKEN_FIELD = '_t';
export const FORM_PAGE_FIELD = '_page';
export const FORM_LOCALE_FIELD = '_locale';
export const FORM_ABOUT_FIELD = '_about';
/**
 * Holds the challenge's site key, so the form's script draws the challenge in a template that
 * knows nothing of it: the key alone for Turnstile, `recaptcha:<key>` for reCAPTCHA (no key holds a colon).
 */
export const FORM_CHALLENGE_KEY_FIELD = '_challenge';

/** Where the editor is served, for the link to a form's submissions in its notice. */
const ADMIN_PATH = '/admin';

/** The largest post a form may send: plenty for words, far too little to fill a disk. */
export const MAX_FORM_POST_BYTES = 64 * 1024;
/** A person takes at least this long to fill in a form. What arrives sooner is suspected. */
const TOO_FAST_MS = 1500;

/** Says whether one more post may be taken from an address. A host with many servers supplies a shared one. */
export interface RateLimiter {
  /** True when the post may go ahead, which counts it. */
  take(address: string): boolean | Promise<boolean>;
}

/** How many posts one address may send in the limiter's stretch of time. */
export type PostLimit = number | (() => number | Promise<number>);

/** Counts posts per address in this server's memory: `limit` in any stretch of `windowMs`. */
export class MemoryRateLimiter implements RateLimiter {
  readonly #taken = new Map<string, number[]>();

  constructor(
    private readonly limit = 8,
    private readonly windowMs = 10 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** `limit` is the most to take from one address just now, when it is not the one this was made with. */
  take(address: string, limit: number = this.limit): boolean {
    const since = this.now() - this.windowMs;
    // Forgets addresses that have gone quiet, so the list cannot grow without end.
    if (this.#taken.size > 5000) {
      for (const [known, times] of this.#taken) if ((times.at(-1) ?? 0) <= since) this.#taken.delete(known);
    }
    const times = (this.#taken.get(address) ?? []).filter((time) => time > since);
    if (times.length >= limit) {
      this.#taken.set(address, times);
      return false;
    }
    this.#taken.set(address, [...times, this.now()]);
    return true;
  }
}

/** Word to one of a form's people that it was filled in. */
export interface SubmissionNotice {
  readonly to: string;
  readonly siteName: string;
  /** What the form is called. */
  readonly formName: string;
  /** Each answer, under its field's label, in the form's order. */
  readonly answers: readonly { readonly label: string; readonly value: string }[];
  /** The whole address of the page it was sent from. */
  readonly page?: string;
  /** The sender's email, so that a reply to the notice goes to them. */
  readonly replyTo?: string;
  /** Where the form's submissions are read in the editor. */
  readonly inbox?: string;
  /** How the site looks, where the host knows. */
  readonly brand?: MailBrand;
}

/** Delivers notices of submissions. A site's mailer that has this method is used for them. */
export interface NoticeMailer {
  sendSubmissionNotice(mail: SubmissionNotice): Promise<void>;
}

/** The words of the pages a visitor without scripts is shown. Give your own for another language. */
export interface FormPostWords {
  readonly sentTitle: string;
  readonly sentMessage: string;
  readonly problemsTitle: string;
  readonly problemsHelp: string;
  readonly back: string;
  readonly tooMany: string;
  readonly tooLarge: string;
  readonly notAForm: string;
  readonly elsewhere: string;
}

export const englishFormPostWords: FormPostWords = {
  sentTitle: 'Thank you',
  sentMessage: 'Your message was sent.',
  problemsTitle: 'A few answers need another look',
  problemsHelp: 'Use your browser\'s Back button to return to the form. What you typed is still there.',
  back: 'Back to the page',
  tooMany: 'Too many messages were sent from here in a short time. Wait a few minutes and try again.',
  tooLarge: 'That is more than this form can take. Shorten your message and try again.',
  notAForm: 'This form is not taking messages.',
  elsewhere: 'This form can only be sent from the site it is on.',
};

export interface FormPostsOptions {
  readonly cms: Cms;
  /**
   * The site's own address, which a post must come from when it says where it comes from. A
   * function is asked for each post, for a site in development that has no fixed address yet.
   */
  readonly origin: string | ((request: Request) => string);
  readonly siteName: string;
  /** The site's secret. It signs the mark that says when a form was drawn. Without it that check is off. */
  readonly secret?: string | undefined;
  /** Who delivers notices. Without one nobody is emailed; submissions are kept all the same. */
  readonly mailer?: NoticeMailer | undefined;
  readonly limiter?: RateLimiter;
  /** Checks that a post's sender passed the site's challenge. Without one no challenge is asked. */
  readonly challenge?: ChallengeCheck;
  /**
   * The entry whose own page is at a path of the site, if any, so that what is sent from a
   * listing's page is known to be about that listing. Asked only when the form's page did not
   * say, with a signed mark, which entry it is about.
   */
  readonly entryAt?: (path: string) => Promise<DealSubject | undefined>;
  readonly words?: FormPostWords;
  readonly now?: () => number;
  /** Told what went wrong when a notice could not be sent. Never given what a visitor wrote. */
  readonly onFault?: (error: unknown) => void;
}

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const escaped = (text: string) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
const isOwnPath = (page: unknown): page is string => typeof page === 'string' && page.length <= 300 && /^\/(?!\/)[^\s\\]*$/.test(page);
const inLanguage = (text: LocalizedText | undefined, locale: string | undefined): string | undefined =>
  text === undefined ? undefined : ((locale !== undefined ? text[locale] : undefined) ?? text['en'] ?? Object.values(text)[0]);

/**
 * Takes what visitors send through the site's forms. It is the one address of the CMS that
 * anyone may post to, so it is narrow: a small body, only from the site's own pages, only so
 * many from one address, and nothing that was sent is ever written back into a page.
 */
export class FormPosts {
  readonly #options: FormPostsOptions;
  readonly #limiter: RateLimiter;
  readonly #words: FormPostWords;
  readonly #now: () => number;

  constructor(options: FormPostsOptions) {
    this.#options = options;
    this.#limiter = options.limiter ?? new MemoryRateLimiter();
    this.#words = options.words ?? englishFormPostWords;
    this.#now = options.now ?? Date.now;
  }

  /**
   * The mark a form's page sends back with a post: when the form was drawn, signed. A post
   * without a true one, or one that follows it too closely, did not come from a person filling
   * in the page. `undefined` when the site has no secret to sign with.
   */
  token(formKey: string): Promise<string | undefined> {
    return formToken(this.#options.secret, formKey, this.#now());
  }

  /** Answers a post to a form's address. `address` is where it came from, when the server knows. */
  async handle(request: Request, formKey: string, address?: string): Promise<Response> {
    const wantsJson = (request.headers.get('accept') ?? '').includes('application/json') || (request.headers.get('content-type') ?? '').includes('application/json');
    const refuse = (status: number, code: string, message: string, extra: Record<string, string> = {}) =>
      wantsJson
        ? Response.json({ error: { code, message } }, { status, headers: { 'cache-control': 'no-store', ...extra } })
        : this.#page(status, this.#words.problemsTitle, [message], undefined, extra);

    if (request.method !== 'POST') return refuse(405, 'method_not_allowed', this.#words.notAForm, { allow: 'POST' });
    // A browser says where a post comes from. One that names another site is not from a page of this one.
    const origin = typeof this.#options.origin === 'string' ? this.#options.origin : this.#options.origin(request);
    const from = request.headers.get('origin');
    if (from !== null && from !== origin) return refuse(403, 'forbidden', this.#words.elsewhere);
    if (address !== undefined && !(await this.#limiter.take(address))) return refuse(429, 'too_many', this.#words.tooMany, { 'retry-after': '600' });

    const sent = await readPost(request);
    if (sent === 'too-large') return refuse(413, 'too_large', this.#words.tooLarge);
    if (sent === null) return refuse(415, 'unsupported', this.#words.notAForm);

    const page = isOwnPath(sent[FORM_PAGE_FIELD]) ? sent[FORM_PAGE_FIELD] : undefined;
    const locale = typeof sent[FORM_LOCALE_FIELD] === 'string' ? sent[FORM_LOCALE_FIELD] : undefined;
    const suspected =
      (typeof sent[FORM_TRAP_FIELD] === 'string' && sent[FORM_TRAP_FIELD] !== '') ||
      !(await this.#drawnForAPerson(formKey, sent[FORM_TOKEN_FIELD])) ||
      // Asked last: a post already suspected is not worth a question to another service.
      !((await this.#options.challenge?.passed(sent[FORM_CHALLENGE_FIELD] ?? sent[FORM_RECAPTCHA_FIELD])) ?? true);

    // A page that cannot be looked up costs the submission nothing but its subject.
    const about = (await this.#marked(formKey, sent[FORM_ABOUT_FIELD])) ?? (page === undefined ? undefined : await this.#options.entryAt?.(page).catch(() => undefined));

    try {
      const { submission, form } = await this.#options.cms.submissions.receive(formKey, sent, { suspected, ...(page !== undefined && { page }), ...(locale !== undefined && { locale }), ...(about !== undefined && { about }) });
      // Whoever the form names is told. A notice that cannot be sent never loses the submission.
      if (submission.status === 'new') await this.#notify(form, submission, origin);
    } catch (error) {
      if (error instanceof NotFoundError) return refuse(404, 'not_found', this.#words.notAForm);
      if (!(error instanceof ValidationError)) throw error;
      if (wantsJson) {
        return Response.json({ error: { code: error.code, message: error.message, issues: error.issues } }, { status: 422, headers: { 'cache-control': 'no-store' } });
      }
      // The form's own labels and the checks' own words: nothing the visitor typed.
      const form = await this.#options.cms.forms.forSite(formKey);
      const lines = error.issues.map((issue) => {
        const field = form?.fields.find((candidate) => candidate.key === issue.path[0]);
        return `${inLanguage(field?.label, locale) ?? String(issue.path[0] ?? '')}: ${issue.message}`;
      });
      return this.#page(422, this.#words.problemsTitle, [...lines, this.#words.problemsHelp], page);
    }

    const form = await this.#options.cms.forms.forSite(formKey);
    const message = inLanguage(form?.success, locale) ?? this.#words.sentMessage;
    return wantsJson
      ? Response.json({ ok: true, message }, { headers: { 'cache-control': 'no-store' } })
      : this.#page(200, this.#words.sentTitle, [message], page ?? '/');
  }

  async #notify(form: FormDef, submission: Submission, origin: string): Promise<void> {
    const { mailer, siteName, onFault } = this.#options;
    if (form.notify.length === 0) return;
    if (!mailer) {
      onFault?.(new Error(`The form "${form.key}" was sent, and nobody was emailed: no email provider is set up. The submission is kept in the CMS.`));
      return;
    }
    const answers = liveFields(form.fields).flatMap((field) => {
      const value = submission.data[field.id];
      if (value === undefined) return [];
      return [{ label: inLanguage(field.label, submission.locale) ?? field.key, value: value === true ? '✓' : String(value) }];
    });
    const notice = {
      siteName,
      formName: inLanguage(form.label, submission.locale) ?? form.key,
      answers,
      ...(submission.page !== undefined && { page: `${origin}${submission.page}` }),
      ...(submission.email !== undefined && { replyTo: submission.email }),
      inbox: `${origin}${ADMIN_PATH}/forms/${encodeURIComponent(form.id)}`,
    };
    for (const to of form.notify) {
      // The fault is told without the notice: a log is not the place for what a visitor wrote.
      await mailer.sendSubmissionNotice({ ...notice, to }).catch((error: unknown) => onFault?.(new Error(`A notice for the form "${form.key}" could not be sent. ${error instanceof Error ? error.message : ''}`)));
    }
  }

  /** Whether the post carries a true mark of when its form was drawn, from long enough ago. */
  async #drawnForAPerson(formKey: string, token: unknown): Promise<boolean> {
    if (this.#options.secret === undefined) return true;
    if (typeof token !== 'string') return false;
    const [drawn = '', signature = ''] = token.split('.');
    if (!/^\d{1,16}$/.test(drawn) || !/^[0-9a-f]{64}$/.test(signature)) return false;
    const expected = await this.#sign(formKey, drawn);
    if (expected === undefined || !sameText(expected, signature)) return false;
    return this.#now() - Number(drawn) >= TOO_FAST_MS;
  }

  async #sign(formKey: string, drawn: string): Promise<string | undefined> {
    const { secret } = this.#options;
    return secret === undefined ? undefined : sign(secret, `form:${formKey}:${drawn}`);
  }

  /** The entry a form's page said it is about, when the mark is one this site signed for this form. */
  async #marked(formKey: string, mark: unknown): Promise<DealSubject | undefined> {
    const { secret } = this.#options;
    if (secret === undefined || typeof mark !== 'string' || mark.length > 400) return undefined;
    const [typeId = '', entry = '', signature = ''] = mark.split('.');
    if (!ID.test(typeId) || !ID.test(entry) || !/^[0-9a-f]{64}$/.test(signature)) return undefined;
    return sameText(await sign(secret, aboutText(formKey, typeId, entry)), signature) ? { typeId, entry } : undefined;
  }

  /** A plain page for a visitor whose browser runs no scripts. Every word in it is the site's own, escaped. */
  #page(status: number, title: string, lines: readonly string[], back: string | undefined, headers: Record<string, string> = {}): Response {
    const html = [
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">',
      `<title>${escaped(title)} · ${escaped(this.#options.siteName)}</title>`,
      '<style>body{margin:0;font:1rem/1.6 system-ui,sans-serif;color:#1a1a1a;background:#fafafa}main{max-width:32rem;margin:15vh auto;padding:0 1.5rem}h1{font-size:1.5rem;margin:0 0 1rem}p{margin:0 0 .75rem}a{color:inherit}@media(prefers-color-scheme:dark){body{color:#eee;background:#111}}</style>',
      `</head><body><main><h1>${escaped(title)}</h1>`,
      ...lines.map((line) => `<p>${escaped(line)}</p>`),
      back === undefined ? '' : `<p><a href="${escaped(back)}">${escaped(this.#words.back)}</a></p>`,
      '</main></body></html>',
    ].join('');
    return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", ...headers } });
  }
}

async function sign(secret: string, text: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}

/** What an id may be made of, so a mark splits into its parts one way only. */
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const aboutText = (formKey: string, typeId: string, entry: string) => `about:${formKey}:${typeId}:${entry}`;

/**
 * The mark a form's page sends along to say which entry it is about, signed with the site's
 * secret so that only the site's own pages can say it. `undefined` without a secret, or for ids
 * a mark cannot carry.
 */
export async function aboutMark(secret: string | undefined, formKey: string, about: DealSubject): Promise<string | undefined> {
  if (secret === undefined || !ID.test(about.typeId) || !ID.test(about.entry)) return undefined;
  return `${about.typeId}.${about.entry}.${await sign(secret, aboutText(formKey, about.typeId, about.entry))}`;
}

/** The mark for a form drawn at `drawn`, signed with the site's secret. `undefined` without a secret. */
export async function formToken(secret: string | undefined, formKey: string, drawn: number = Date.now()): Promise<string | undefined> {
  return secret === undefined ? undefined : `${drawn}.${await sign(secret, `form:${formKey}:${drawn}`)}`;
}

/** Compares two texts of the same length without stopping at the first difference. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

/**
 * What a post holds, by name: a plain form's fields or a script's JSON. `null` for a body that
 * is neither, `too-large` for one over the limit. Files are left out: forms take none yet.
 */
async function readPost(request: Request): Promise<Record<string, unknown> | 'too-large' | null> {
  const type = request.headers.get('content-type') ?? '';
  if (Number(request.headers.get('content-length') ?? 0) > MAX_FORM_POST_BYTES) return 'too-large';
  const bytes = await readLimited(request);
  if (bytes === null) return 'too-large';
  if (type.includes('application/json')) {
    try {
      const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
      return typeof body === 'object' && body !== null && !Array.isArray(body) ? { ...body } : null;
    } catch {
      return null;
    }
  }
  if (!type.includes('application/x-www-form-urlencoded') && !type.includes('multipart/form-data')) return null;
  try {
    const data = await new Response(bytes, { headers: { 'content-type': type } }).formData();
    const sent: Record<string, unknown> = {};
    for (const [name, value] of data) if (typeof value === 'string') sent[name] = value;
    return sent;
  } catch {
    return null;
  }
}

/** The body, or `null` once it has passed the limit, however long it said it was. */
export async function readLimited(request: Request, limit = MAX_FORM_POST_BYTES): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
