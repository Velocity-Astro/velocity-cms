# Security

## Reporting a problem

Please report a security problem privately, not in a public issue.

Use **[Report a vulnerability](https://github.com/Velocity-Astro/velocity-cms/security/advisories/new)** on this repository's Security tab. It opens a private conversation with the maintainers.

Say what you found, how to reproduce it, and what someone could do with it. You will get a first answer within three working days. We will keep you informed while we fix it, credit you in the release notes unless you would rather not be named, and ask that you give us a reasonable time to release a fix before you publish.

## What is supported

During the beta, only the latest `0.x` release gets security fixes.

## What has been reviewed

The maintainers reviewed sign-in and sessions, the API, the address forms post to, previews, uploads, plugin secrets and every request the site sends out before the first beta, and fixed what that found. **No outside party has reviewed the code yet.** An outside review is planned before the hosted service takes paying customers.

Two limits are known and accepted for now:

- Before a webhook is sent, the name it is sent to is looked up and refused if it leads to a private address. The lookup and the request are two steps, so a name that changes between them is not caught. If your site runs beside machines that trust it, restrict its outbound network as well.
- The limits on sign-in links per address and on form posts per sender are kept in memory, per running copy of the site.

## How the CMS treats what it holds

- No passwords: people sign in with an email link or a passkey, and nobody can create their own account.
- What visitors send through forms, and the contacts made from it, are personal data: read only by people with the right role, never written to a page, a cache, the search index or a log, and exportable and erasable per person.
- A plugin's key is sealed with the site's secret before it is stored and is never sent back to the editor.
- Keep `VELOCITY_CMS_SECRET` out of git. Changing it signs everyone out and makes saved plugin keys unreadable.
