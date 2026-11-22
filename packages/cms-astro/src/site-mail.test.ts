import { MemoryMailer } from '@velocity-astro/cms-auth';
import { ConflictError, createCms, type Actor } from '@velocity-astro/cms-core';
import { InMemoryEntryRepository, InMemorySchemaRepository } from '@velocity-astro/cms-core/testing';
import { expect, it } from 'vitest';
import { SiteMail } from './site-mail.js';

const owner: Actor = { kind: 'user', id: 'u1', role: 'owner' };
const signIn = { email: 'dana@example.com', name: 'Dana', url: 'https://site.test/in', expiresInMinutes: 10, siteName: 'Lakeshore' };
const notice = { to: 'office@example.com', siteName: 'Lakeshore', formName: 'Contact', answers: [{ label: 'Name', value: 'Ana' }] };
const test = { email: 'dana@example.com', name: 'Dana', siteName: 'Lakeshore' };

function site(options: { own?: MemoryMailer; env?: Record<string, string>; hosted?: boolean; answer?: () => Response | Promise<Response> } = {}) {
  const cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), secret: 's'.repeat(32) });
  const sent: { key: string; from: string; to: string[]; subject: string; text: string }[] = [];
  const log = new MemoryMailer();
  const mail = new SiteMail({
    settings: cms.settings,
    fallback: log,
    env: options.env ?? {},
    ...(options.own && { own: options.own }),
    ...(options.hosted !== undefined && { hosted: options.hosted }),
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { from: string; to: string[]; subject: string; text: string };
      sent.push({ key: new Headers(init?.headers).get('authorization') ?? '', ...body });
      return (await options.answer?.()) ?? new Response('{}');
    },
  });
  return { cms, mail, sent, log };
}

it('prints sign-in links to the log and sends no notice until email is set up, then follows the editor at once', async () => {
  const { cms, mail, sent, log } = site();
  expect(mail.fixedBy()).toBeNull();
  expect(await mail.canTest()).toBe(false);
  await mail.sendSignInLink(signIn);
  expect(log.sent).toHaveLength(1);
  await expect(mail.sendSubmissionNotice(notice)).rejects.toThrow(/Settings, Email/);
  await expect(mail.sendTest(test)).rejects.toBeInstanceOf(ConflictError);

  await cms.settings.saveEmail(owner, { from: 'Lakeshore <cms@lakeshore.example>', apiKey: 're_editor', expectedRevision: 0 });
  expect(await mail.canTest()).toBe(true);
  await mail.sendSignInLink(signIn);
  await mail.sendInvitation({ email: 'ben@example.com', name: 'Ben', url: 'https://site.test/admin', siteName: 'Lakeshore' });
  await mail.sendSubmissionNotice(notice);
  await mail.sendTest(test);
  expect(log.sent).toHaveLength(1);
  expect(sent.map((one) => [one.key, one.from, one.to[0]])).toEqual([
    ['Bearer re_editor', 'Lakeshore <cms@lakeshore.example>', 'dana@example.com'],
    ['Bearer re_editor', 'Lakeshore <cms@lakeshore.example>', 'ben@example.com'],
    ['Bearer re_editor', 'Lakeshore <cms@lakeshore.example>', 'office@example.com'],
    ['Bearer re_editor', 'Lakeshore <cms@lakeshore.example>', 'dana@example.com'],
  ]);
  expect(sent[3]).toMatchObject({ subject: 'Email works for Lakeshore' });
  expect(sent[3]?.text).not.toContain('http');

  await cms.settings.saveEmail(owner, { from: 'cms@lakeshore.example', apiKey: null, expectedRevision: 1 });
  await mail.sendSignInLink(signIn);
  expect(log.sent).toHaveLength(2);
});

it('lets the server\'s settings win over the editor\'s, and the site\'s own mailer over both', async () => {
  const env = { VELOCITY_CMS_RESEND_API_KEY: 're_server', VELOCITY_CMS_EMAIL_FROM: 'server@lakeshore.example' };
  const server = site({ env });
  await server.cms.settings.saveEmail(owner, { from: 'editor@lakeshore.example', apiKey: 're_editor', expectedRevision: 0 });
  expect(server.mail.fixedBy()).toBe('server');
  await server.mail.sendSignInLink(signIn);
  await server.mail.sendSubmissionNotice(notice);
  expect(server.sent.map((one) => one.key)).toEqual(['Bearer re_server', 'Bearer re_server']);
  expect(site({ env, hosted: true }).mail.fixedBy()).toBe('host');

  const own = new MemoryMailer();
  const coded = site({ own, env });
  await coded.cms.settings.saveEmail(owner, { from: 'editor@lakeshore.example', apiKey: 're_editor', expectedRevision: 0 });
  expect(coded.mail.fixedBy()).toBe('code');
  expect(site({ own, hosted: true }).mail.fixedBy()).toBe('host');
  await coded.mail.sendSignInLink(signIn);
  expect(own.sent).toHaveLength(1);
  // This mailer of the site's sends no notices and no tests: notices go as the settings say.
  expect(await coded.mail.canTest()).toBe(false);
  await coded.mail.sendSubmissionNotice(notice);
  expect(coded.sent.map((one) => one.key)).toEqual(['Bearer re_server']);
});

it('tells the owner what to look at when a test is refused, and nothing of what the provider said', async () => {
  for (const [status, words] of [[401, /API key/], [403, /domain/], [422, /sender/], [429, /later/], [500, /\(500\)/]] as const) {
    const { cms, mail } = site({ answer: () => new Response('{"message":"secret detail re_editor"}', { status }) });
    await cms.settings.saveEmail(owner, { from: 'cms@lakeshore.example', apiKey: 're_editor', expectedRevision: 0 });
    const refused = await mail.sendTest(test).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ConflictError);
    expect((refused as Error).message).toMatch(words);
    expect((refused as Error).message).not.toContain('secret detail');
  }
  const down = site({ answer: () => Promise.reject(new Error('getaddrinfo ENOTFOUND')) });
  await down.cms.settings.saveEmail(owner, { from: 'cms@lakeshore.example', apiKey: 're_editor', expectedRevision: 0 });
  await expect(down.mail.sendTest(test)).rejects.toThrow(/could not be reached/);
});

it('calls the site what an owner called it, in every email, and by its own name until then', async () => {
  const { cms, sent } = site();
  const mail = new SiteMail({ settings: cms.settings, fallback: new MemoryMailer(), env: {}, siteName: () => cms.settings.siteName(), fetch: async (_input, init) => {
    sent.push({ key: '', ...(JSON.parse(String(init?.body)) as { from: string; to: string[]; subject: string; text: string }) });
    return new Response('{}');
  } });
  await cms.settings.saveEmail(owner, { from: 'cms@lakeshore.example', apiKey: 're_editor', expectedRevision: 0 });
  await mail.sendSignInLink(signIn);
  await cms.settings.saveGeneral(owner, { siteName: 'Oakhaven Homes', expectedRevision: 0 });
  await mail.sendSignInLink(signIn);
  await mail.sendSubmissionNotice(notice);
  await mail.sendTest(test);
  expect(sent.map((one) => one.subject)).toEqual(['Your sign-in link for Lakeshore', 'Your sign-in link for Oakhaven Homes', 'New message: Contact on Oakhaven Homes', 'Email works for Oakhaven Homes']);
});

it('sends a bare address under the sender name an owner saved, else the site\'s name, and keeps a name the server gives', async () => {
  const bare = site({ env: { VELOCITY_CMS_RESEND_API_KEY: 're_server', VELOCITY_CMS_EMAIL_FROM: 'cms@lakeshore.example' } });
  await bare.mail.sendSignInLink(signIn);
  expect(bare.sent.at(-1)?.from).toBe('"Lakeshore" <cms@lakeshore.example>');
  expect(bare.mail.namesSender()).toBeNull();
  await bare.cms.settings.saveEmail(owner, { senderName: 'Lakeshore Realty', expectedRevision: 0 });
  await bare.mail.sendSignInLink(signIn);
  expect(bare.sent.at(-1)?.from).toBe('"Lakeshore Realty" <cms@lakeshore.example>');

  const named = site({ env: { VELOCITY_CMS_RESEND_API_KEY: 're_server', VELOCITY_CMS_EMAIL_FROM: 'Front desk <cms@lakeshore.example>' } });
  await named.cms.settings.saveEmail(owner, { senderName: 'Ignored', expectedRevision: 0 });
  await named.mail.sendSignInLink(signIn);
  expect(named.sent.at(-1)?.from).toBe('Front desk <cms@lakeshore.example>');
  expect(named.mail.namesSender()).toBe('server');

  const editor = site();
  await expect(editor.cms.settings.saveEmail(owner, { from: 'cms@lakeshore.example', senderName: 'Lakeshore "Realty"', apiKey: 're_editor', expectedRevision: 0 })).rejects.toMatchObject({ code: 'validation_failed' });
  await editor.cms.settings.saveEmail(owner, { from: 'Old <cms@lakeshore.example>', senderName: 'Lakeshore Realty', apiKey: 're_editor', expectedRevision: 0 });
  await editor.mail.sendSignInLink(signIn);
  expect(editor.sent.at(-1)?.from).toBe('"Lakeshore Realty" <cms@lakeshore.example>');
  expect(site({ own: new MemoryMailer() }).mail.namesSender()).toBe('code');
});

it('dresses every email in the site\'s look: its logo as a PNG from its own address, its colour and its address', async () => {
  const cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), secret: 's'.repeat(32) });
  const own = new MemoryMailer();
  const mail = new SiteMail({ settings: cms.settings, own, fallback: new MemoryMailer(), origin: 'https://lakeshore.example', brand: async () => ({ logo: 'logo mark', color: '#0a7cff' }) });
  await mail.sendSignInLink(signIn);
  expect(own.sent[0]?.brand).toEqual({ url: 'https://lakeshore.example', logo: 'https://lakeshore.example/cms-mail/logo%20mark.png', color: '#0a7cff' });
  await mail.sendEmailChange({ email: 'new@example.com', name: 'Dana', url: 'https://lakeshore.example/admin/profile?email=x', expiresInMinutes: 30, siteName: 'Lakeshore' });
  expect(own.emailChanges[0]?.brand?.color).toBe('#0a7cff');

  // A look that cannot be read leaves the email as it was.
  const plain = new MemoryMailer();
  await new SiteMail({ settings: cms.settings, own: plain, fallback: new MemoryMailer(), brand: () => Promise.reject(new Error('x')) }).sendSignInLink(signIn);
  expect(plain.sent[0]).not.toHaveProperty('brand');
});
