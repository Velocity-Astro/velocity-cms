# velocity-cms

The command that adds [Velocity CMS](https://github.com/Velocity-Astro/velocity-cms) to an Astro site.

```sh
npx velocity-cms init you@example.com "Your Name"
```

It installs `@velocity-astro/cms-astro` with the site's own package manager, writes a secret to `.env`, adds the integration to the Astro config and makes you the site's owner. Run again, it changes nothing that is there.

```sh
npx velocity-cms owner <email> <name>   # the site's first owner, with a link that signs them in
npx velocity-cms link <email>           # a new sign-in link for someone who has access
```

Docs: https://docs.deployvelocity.com/cms/

MIT
