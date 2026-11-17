#!/usr/bin/env node
/* global navigator, PublicKeyCredential -- used inside page.evaluate, which runs in the browser */
/**
 * Sign-in prototype: does Better Auth do what the CMS needs, in the CMS's own SQLite database?
 *
 *   node prototypes/auth/run.mjs
 *
 * Creates the tables, invites one person, signs them in by email link, registers a passkey in a
 * real browser (Chromium's built-in test authenticator) and signs in with it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
process.chdir(here);
fs.rmSync('work', { recursive: true, force: true });
fs.mkdirSync('work');

// 1. Tables, from the generated Drizzle schema, into an empty SQLite file.
execFileSync('pnpm', ['exec', 'drizzle-kit', 'generate', '--dialect', 'sqlite', '--schema', './schema.ts', '--out', './work/migrations'], { stdio: 'ignore' });
{
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const { migrate } = await import('drizzle-orm/libsql/migrator');
  const setup = createClient({ url: 'file:./work/auth.db' });
  await migrate(drizzle(setup), { migrationsFolder: './work/migrations' });
  setup.close();
}

const { auth, client, ORIGIN, outbox } = await import('./auth.mjs');
const { toNodeHandler } = await import('better-auth/node');
const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).rows.map((row) => row.name);

const handler = toNodeHandler(auth);
const server = http.createServer((request, response) => {
  if (request.url.startsWith('/api/auth')) return handler(request, response);
  response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>Sign in</title>');
});
await new Promise((resolve) => server.listen(new URL(ORIGIN).port, resolve));

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const timed = async (work) => {
  const started = performance.now();
  const value = await work();
  return { value, ms: performance.now() - started };
};
const api = (route, init = {}) =>
  fetch(`${ORIGIN}/api/auth${route}`, { redirect: 'manual', ...init, headers: { origin: ORIGIN, 'content-type': 'application/json', ...init.headers } });
const cookieOf = (response) => response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
const sessionOf = async (cookie) => (await api('/get-session', { headers: { cookie } })).json();

/** What the CMS needs from a session: who is asking, and with which role. */
const toActor = (session) => (session ? { kind: 'user', id: session.user.id, role: session.user.role } : null);

try {
  // 2. An invitation: the owner adds a person. There is no public sign-up.
  const context = await auth.$context;
  const invited = await context.internalAdapter.createUser({ email: 'dana@example.com', name: 'Dana', emailVerified: true, role: 'editor' });

  // 3. Email link.
  const asked = await timed(() => api('/sign-in/magic-link', { method: 'POST', body: JSON.stringify({ email: invited.email, callbackURL: '/admin' }) }));
  check('An invited person is sent a link', asked.value.status === 200 && outbox.length === 1, `${asked.ms.toFixed(0)} ms`);
  const stored = (await client.execute('SELECT value, identifier FROM verification')).rows;
  const token = new URL(outbox[0].url).searchParams.get('token');
  check('The link token is not stored in readable form', stored.length === 1 && !JSON.stringify(stored).includes(token));

  await api('/sign-in/magic-link', { method: 'POST', body: JSON.stringify({ email: 'stranger@example.com' }) });
  const users = (await client.execute('SELECT email FROM user')).rows;
  // The plugin still calls the sender for an unknown address; what matters is that no account or session can come of it.
  const strangerLink = outbox.find((mail) => mail.email === 'stranger@example.com');
  const strangerVisit = strangerLink ? await fetch(strangerLink.url, { redirect: 'manual' }) : null;
  check('A stranger cannot create an account', users.length === 1 && (!strangerVisit || cookieOf(strangerVisit) === '' || !(await sessionOf(cookieOf(strangerVisit)))), strangerLink ? 'a link was produced but opens nothing' : 'no link produced');

  const opened = await timed(() => fetch(outbox[0].url, { redirect: 'manual' }));
  const linkCookie = cookieOf(opened.value);
  const linkSession = await sessionOf(linkCookie);
  check('Opening the link signs them in', linkSession?.user?.email === invited.email, `${opened.ms.toFixed(0)} ms, sent on to ${opened.value.headers.get('location')}`);
  check('The session carries the CMS role', JSON.stringify(toActor(linkSession)) === JSON.stringify({ kind: 'user', id: invited.id, role: 'editor' }), JSON.stringify(toActor(linkSession)));
  const cookieText = opened.value.headers.getSetCookie().join(' | ').toLowerCase();
  check('The session cookie is HttpOnly and SameSite', cookieText.includes('httponly') && cookieText.includes('samesite=lax'));

  const again = await fetch(outbox[0].url, { redirect: 'manual' });
  check('The link works once', cookieOf(again) === '' || !(await sessionOf(cookieOf(again))), `second use sent to ${again.headers.get('location')}`);

  const forged = await api('/update-user', { method: 'POST', headers: { cookie: linkCookie }, body: JSON.stringify({ role: 'owner' }) });
  const roleAfter = (await client.execute('SELECT role FROM user')).rows[0].role;
  check('A signed-in person cannot change their own role', roleAfter === 'editor', `request answered ${forged.status}`);

  check('No session without a cookie', (await sessionOf('')) === null);

  // 4. Passkey, in a real browser with Chromium's test authenticator.
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  try {
    const browserContext = await browser.newContext();
    const page = await browserContext.newPage();
    const cdp = await browserContext.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });
    await browserContext.addCookies(linkCookie.split('; ').map((pair) => ({ name: pair.slice(0, pair.indexOf('=')), value: pair.slice(pair.indexOf('=') + 1), url: ORIGIN })));
    await page.goto(ORIGIN);

    const registered = await timed(() =>
      page.evaluate(async () => {
        const options = await (await fetch('/api/auth/passkey/generate-register-options')).json();
        if (!options.challenge) return { step: 'options', options };
        const credential = await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options) });
        const verified = await fetch('/api/auth/passkey/verify-registration', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ response: credential.toJSON(), name: 'Test key' }),
        });
        return { status: verified.status, body: await verified.json() };
      }),
    );
    const passkeys = (await client.execute('SELECT name, user_id FROM passkey')).rows;
    check('A signed-in person registers a passkey', registered.value.status === 200 && passkeys.length === 1, `${registered.ms.toFixed(0)} ms${registered.value.status === 200 ? '' : ` ${JSON.stringify(registered.value).slice(0, 300)}`}`);

    await browserContext.clearCookies();
    const signedOut = await page.evaluate(async () => (await fetch('/api/auth/get-session')).json());
    const signedIn = await timed(() =>
      page.evaluate(async () => {
        const options = await (await fetch('/api/auth/passkey/generate-authenticate-options')).json();
        if (!options.challenge) return { step: 'options', options };
        const credential = await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options) });
        const verified = await fetch('/api/auth/passkey/verify-authentication', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ response: credential.toJSON() }),
        });
        return { status: verified.status, session: await (await fetch('/api/auth/get-session')).json() };
      }),
    );
    check(
      'Signed out, they sign back in with the passkey alone',
      signedOut === null && signedIn.value.session?.user?.email === invited.email,
      `${signedIn.ms.toFixed(0)} ms${signedIn.value.session ? '' : ` ${JSON.stringify(signedIn.value).slice(0, 300)}`}`,
    );

    await page.evaluate(() => fetch('/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
    check('Signing out ends the session', (await page.evaluate(async () => (await fetch('/api/auth/get-session')).json())) === null);
  } finally {
    await browser.close();
  }

  console.log(`Tables Better Auth keeps in the CMS database: ${tables.join(', ')}.\n`);
  console.log('| Check | Result | Detail |\n|---|---|---|');
  for (const { name, ok, detail } of results) console.log(`| ${name} | ${ok ? 'yes' : 'NO'} | ${detail} |`);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
} finally {
  server.close();
  client.close();
}
