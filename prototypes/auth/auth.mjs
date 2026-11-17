/**
 * Better Auth set up the way the CMS would use it: the CMS's own SQLite database through
 * Drizzle, sign-in by email link and by passkey, no passwords and no outside account.
 */
import { createClient } from '@libsql/client';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { drizzle } from 'drizzle-orm/libsql';

export const ORIGIN = process.env.AUTH_ORIGIN ?? 'http://localhost:4398';
export const DATABASE = process.env.AUTH_DATABASE ?? 'file:./work/auth.db';

/** Email links that were "sent". The CMS will hand these to the site's email provider. */
export const outbox = [];

export const client = createClient({ url: DATABASE });
// The schema file is generated from this config, so it cannot be imported while generating it.
const schema = process.env.AUTH_GENERATING ? undefined : await import('./schema.ts');
const db = drizzle(client, schema ? { schema } : {});

export const auth = betterAuth({
  baseURL: ORIGIN,
  secret: process.env.AUTH_SECRET ?? 'prototype-secret-prototype-secret-0123',
  database: drizzleAdapter(db, { provider: 'sqlite', ...(schema && { schema }) }),
  // The CMS role lives on the user. Nobody can set it through a sign-in request.
  user: { additionalFields: { role: { type: 'string', required: true, defaultValue: 'author', input: false } } },
  plugins: [
    magicLink({
      // Only people already invited can sign in: a stranger's email creates nothing.
      disableSignUp: true,
      storeToken: 'hashed',
      sendMagicLink: async ({ email, url }) => void outbox.push({ email, url }),
    }),
    passkey({ rpID: new URL(ORIGIN).hostname, rpName: 'Velocity CMS', origin: ORIGIN }),
  ],
});
