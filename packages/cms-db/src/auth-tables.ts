/**
 * Who can sign in, and their sessions. These tables belong to the sign-in library (`cms-auth`
 * wraps Better Auth), which reads and writes them; their columns are the ones it expects. They
 * live here so one set of migrations sets up the whole database, and carry an `auth_` prefix so
 * they can never collide with a site's own content.
 *
 * Don't query them from anywhere but `cms-auth`.
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull();
const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .default(now)
    .$onUpdate(() => new Date())
    .notNull();

/** A person who may sign in. `role` is the CMS role: owner, editor or author. */
export const authUser = sqliteTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  role: text('role').default('author').notNull(),
});

export const authSession = sqliteTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
  },
  (table) => [index('auth_session_user_id').on(table.userId)],
);

/** How a person signs in. The library requires the table; with no passwords it stays small. */
export const authAccount = sqliteTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('auth_account_user_id').on(table.userId)],
);

/** Sign-in links that have been sent and not yet used. Tokens are stored hashed. */
export const authVerification = sqliteTable(
  'auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('auth_verification_identifier').on(table.identifier)],
);

export const authPasskey = sqliteTable(
  'auth_passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    transports: text('transports'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    aaguid: text('aaguid'),
  },
  (table) => [index('auth_passkey_user_id').on(table.userId), index('auth_passkey_credential_id').on(table.credentialID)],
);
