import { expect, it } from 'vitest';
import { ResendMailer, mailerFromEnv } from './resend-mailer.js';

function mailer(answer: () => Response = () => new Response('{"id":"1"}', { status: 200 })) {
  const sent: { url: string; headers: Headers; body: { from: string; to: string[]; subject: string; html: string; text: string } }[] = [];
  const send = new ResendMailer({
    apiKey: 're_test',
    from: 'Lakeshore <cms@lakeshore.example>',
    fetch: async (input, init) => {
      sent.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as never });
      return answer();
    },
  });
  return { send, sent };
}

it('sends a sign-in link with the address in full, and says how long it works', async () => {
  const { send, sent } = mailer();
  await send.sendSignInLink({ email: 'dana@example.com', name: 'Dana', url: 'https://site.test/api/cms/auth/verify?token=abc&x=1', expiresInMinutes: 10, siteName: 'Lakeshore' });
  const [mail] = sent;
  expect(mail?.url).toBe('https://api.resend.com/emails');
  expect(mail?.headers.get('authorization')).toBe('Bearer re_test');
  expect(mail?.body).toMatchObject({ from: 'Lakeshore <cms@lakeshore.example>', to: ['dana@example.com'], subject: 'Your sign-in link for Lakeshore' });
  expect(mail?.body.text).toContain('https://site.test/api/cms/auth/verify?token=abc&x=1');
  expect(mail?.body.text).toContain('expires in 10 minutes');
  expect(mail?.body.html).toContain('href="https://site.test/api/cms/auth/verify?token=abc&#38;x=1"');
});

it('sends an invitation that points at the editor, and keeps a name from becoming markup', async () => {
  const { send, sent } = mailer();
  await send.sendInvitation({ email: 'ben@example.com', name: '<b>Ben</b>', url: 'https://site.test/admin', siteName: 'Lakeshore' });
  expect(sent[0]?.body.subject).toBe('You can now edit Lakeshore');
  expect(sent[0]?.body.html).toContain('&#60;b&#62;Ben&#60;/b&#62;');
  expect(sent[0]?.body.html).not.toContain('<b>Ben');
  expect(sent[0]?.body.text).toContain('https://site.test/admin');
});

it('throws when the provider refuses, without the address in the message', async () => {
  const { send } = mailer(() => new Response('{"message":"domain not verified"}', { status: 403 }));
  const failure = send.sendInvitation({ email: 'ben@example.com', name: 'Ben', url: 'https://site.test/admin', siteName: 'Lakeshore' });
  await expect(failure).rejects.toThrow(/Resend refused an email \(403\).*domain not verified/);
  await expect(failure).rejects.not.toThrow(/ben@example.com/);
});

it('is chosen from the settings only when both the key and the sender are there', () => {
  expect(mailerFromEnv({})).toBeUndefined();
  expect(mailerFromEnv({ VELOCITY_CMS_RESEND_API_KEY: 're_x' })).toBeUndefined();
  expect(mailerFromEnv({ VELOCITY_CMS_RESEND_API_KEY: 're_x', VELOCITY_CMS_EMAIL_FROM: 'a@b.example' })).toBeInstanceOf(ResendMailer);
});
