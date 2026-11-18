import { defineConfig, memoryCache } from 'astro/config';
import node from '@astrojs/node';
import velocityCms from '@velocity-astro/cms-astro';

export default defineConfig({
  // The site's address. Sign-in links lead here once the site is deployed.
  site: process.env.SITE_URL || 'http://localhost:4321',
  // The editor and live pages run on a server.
  adapter: node({ mode: 'standalone' }),
  integrations: [velocityCms({ siteName: 'Starter', entryPages: ['pages'] })],
  // A page drawn from the CMS is kept until a publish clears it. A day is the backstop.
  cache: { provider: memoryCache() },
  routeRules: { '/[...path]': { maxAge: 86400, tags: ['cms'] } },
});
