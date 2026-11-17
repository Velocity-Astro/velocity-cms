# Sign-in: does Better Auth fit?

The plan names Better Auth for sign-in, behind the CMS's own `AuthProvider` interface, with
passkeys and email links and no passwords. This prototype checks that choice before phase 1
builds on it.

```bash
cd prototypes/auth && pnpm install --ignore-workspace && node run.mjs
```

`auth.mjs` is the whole setup: Better Auth 1.7.25 on the CMS's SQLite database through its Drizzle
adapter, the email link plugin and the passkey plugin. `schema.ts` is generated from that file by
Better Auth's CLI. `run.mjs` invites one person, then drives every step over HTTP, and the passkey
steps in Chromium with its built-in test authenticator.

## Results (2026-11-17)

Tables Better Auth keeps in the CMS database: account, passkey, session, user, verification.

| Check | Result | Detail |
|---|---|---|
| An invited person is sent a link | yes | 54 ms |
| The link token is not stored in readable form | yes | |
| A stranger cannot create an account | yes | a link was produced but opens nothing |
| Opening the link signs them in | yes | 14 ms |
| The session carries the CMS role | yes | `{ kind: 'user', id, role: 'editor' }` |
| The session cookie is HttpOnly and SameSite | yes | |
| The link works once | yes | second use is sent on with `error=INVALID_TOKEN` |
| A signed-in person cannot change their own role | yes | request answered 400 |
| No session without a cookie | yes | |
| A signed-in person registers a passkey | yes | 52 ms |
| Signed out, they sign back in with the passkey alone | yes | 31 ms |
| Signing out ends the session | yes | |

## Verdict

Better Auth fits. It runs in the same SQLite file with the same Drizzle and Zod versions the CMS
already uses, needs no outside account, and both sign-in methods work without a password anywhere.

## What the real package (`cms-auth`) has to do

1. **Hide Better Auth behind one interface.** The rest of the CMS should see only
   `actorFor(request): Promise<Actor | null>`, plus invite and sign-out. The mapping is three
   lines here (`toActor`), and it is the only place that knows the library.
2. **Never email a stranger.** With sign-up off, the plugin still calls the send function for an
   address it does not know. The link opens nothing, but the email would go out. The CMS's send
   function must look the address up first and stay silent, with the same answer either way.
3. **Own the tables.** The generated schema moves into `cms-db` with an `auth_` prefix, as a normal
   migration, so one command still sets up the whole database.
4. **First owner.** Nobody exists on a new site. The CLI, or a one-time setup link printed at
   install, creates the owner. Cloud does it at provisioning.
5. **Email delivery is a setting, and a risk.** Self-hosters need an email provider before anyone
   can sign in by link. The setup link above is what keeps a site reachable without one.
6. **Passkeys are tied to the domain.** A passkey made on the free Cloud address does not work
   after the site moves to its own domain. The email link is the way back in, and the editor
   should prompt for a new passkey then.
7. **Not checked here:** rate limits under attack, session lifetime settings, and running on a
   host without long-lived processes.
