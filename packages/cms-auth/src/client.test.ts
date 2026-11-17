import { afterEach, expect, it, vi } from 'vitest';
import { SignInError, createAuthClient } from './client.js';

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

/** A `fetch` that answers from a list and records what it was asked. */
const server = (...answers: (Response | Error)[]) => {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const answer = answers.shift() ?? Response.json({});
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { fetch, calls };
};

afterEach(() => vi.unstubAllGlobals());

it('asks for a link that lands on the editor, and on the sign-in screen if it has expired', async () => {
  const { fetch, calls } = server();
  await createAuthClient({ fetch }).requestSignInLink('dana@example.com');
  expect(calls).toEqual([
    {
      url: '/api/cms/auth/sign-in/magic-link',
      method: 'POST',
      body: { email: 'dana@example.com', callbackURL: '/admin', errorCallbackURL: '/admin/sign-in?link=expired' },
    },
  ]);
});

it('follows the site when sign-in and the editor are mounted somewhere else', async () => {
  const { fetch, calls } = server();
  const client = createAuthClient({ fetch, basePath: '/cms/auth/', adminPath: '/studio' });
  await client.requestSignInLink('dana@example.com');
  await client.signOut();
  expect(calls.map((call) => call.url)).toEqual(['/cms/auth/sign-in/magic-link', '/cms/auth/sign-out']);
  expect(calls[0]?.body).toMatchObject({ callbackURL: '/studio' });
});

it('says what to do when the server refuses, is busy or cannot be reached', async () => {
  const cases: [Response | Error, string][] = [
    [new Response('{}', { status: 429 }), 'Too many attempts. Wait a minute, then try again.'],
    [new Response('<h1>Bad gateway</h1>', { status: 502 }), 'Signing in did not work. Try again, or ask for a new sign-in link.'],
    [new TypeError('Failed to fetch'), 'The server could not be reached. Check your connection and try again.'],
  ];
  for (const [answer, message] of cases) {
    const attempt = createAuthClient({ fetch: server(answer).fetch }).requestSignInLink('dana@example.com');
    await expect(attempt).rejects.toThrow(message);
    await expect(attempt).rejects.toBeInstanceOf(SignInError);
  }
});

it('says so where passkeys cannot be used, without asking the server anything', async () => {
  const { fetch, calls } = server();
  await expect(createAuthClient({ fetch }).signInWithPasskey()).rejects.toThrow('This browser cannot use passkeys. Use a sign-in link instead.');
  await expect(createAuthClient({ fetch }).registerPasskey('Laptop')).rejects.toBeInstanceOf(SignInError);
  expect(calls).toEqual([]);
});

it('signs in with a passkey: the server offers, the browser answers, the server checks', async () => {
  const credential = { toJSON: () => ({ id: 'cred-1' }) };
  const get = vi.fn(async () => credential);
  vi.stubGlobal('PublicKeyCredential', { parseRequestOptionsFromJSON: (options: unknown) => ({ parsed: options }) });
  vi.stubGlobal('navigator', { credentials: { get } });
  const { fetch, calls } = server(
    Response.json({ challenge: 'abc' }),
    Response.json({ ok: true }),
    Response.json({ user: { id: 'u1', email: 'dana@example.com', name: 'Dana', role: 'editor' } }),
  );

  expect(await createAuthClient({ fetch }).signInWithPasskey()).toEqual({ id: 'u1', email: 'dana@example.com', name: 'Dana' });
  expect(get).toHaveBeenCalledWith({ publicKey: { parsed: { challenge: 'abc' } } });
  expect(calls.map((call) => [call.method, call.url])).toEqual([
    ['GET', '/api/cms/auth/passkey/generate-authenticate-options'],
    ['POST', '/api/cms/auth/passkey/verify-authentication'],
    ['GET', '/api/cms/auth/get-session'],
  ]);
  expect(calls[1]?.body).toEqual({ response: { id: 'cred-1' } });
});

it('adds a passkey under the name the person gave it', async () => {
  vi.stubGlobal('PublicKeyCredential', { parseRequestOptionsFromJSON: () => ({}), parseCreationOptionsFromJSON: (options: unknown) => options });
  vi.stubGlobal('navigator', { credentials: { create: async () => ({ toJSON: () => ({ id: 'new' }) }) } });
  const { fetch, calls } = server(Response.json({ challenge: 'abc' }), Response.json({ ok: true }));
  await createAuthClient({ fetch }).registerPasskey('Work laptop');
  expect(calls[1]).toEqual({ url: '/api/cms/auth/passkey/verify-registration', method: 'POST', body: { response: { id: 'new' }, name: 'Work laptop' } });
});
