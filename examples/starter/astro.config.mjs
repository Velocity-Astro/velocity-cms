import { defineConfig, memoryCache } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import velocityCms from '@velocity-astro/cms-astro';

export default defineConfig({
  // The site's address. Sign-in links lead here once the site is deployed.
  site: process.env.SITE_URL || 'http://localhost:4321',
  // The editor and live pages run on a server. CMS_WORKERS is for `npm run check:workers`, which runs
  // this site as a Cloudflare Worker on a D1 database (wrangler.jsonc). A site of its own names one adapter.
  adapter: process.env.CMS_WORKERS ? cloudflare() : node({ mode: 'standalone' }),
  // CMS_SITES is for `npm run check:hosted`, which runs two sites from this one copy. A site of its own leaves it unset.
  // A copy that runs many sites must also say which host names it answers to: Astro takes a request's
  // host name at its word only when it is listed here, and a site is chosen by that name.
  ...(process.env.CMS_SITES && { security: { allowedDomains: [{ hostname: '**.test' }] } }),
  integrations: [velocityCms({ siteName: 'Starter', entryPages: ['pages'], ...(process.env.CMS_SITES && { sites: process.env.CMS_SITES }) })],
  // A page drawn from the CMS is kept until a publish clears it. A day is the backstop.
  cache: { provider: memoryCache() },
  routeRules: { '/[...path]': { maxAge: 86400, tags: ['cms'] } },
});
