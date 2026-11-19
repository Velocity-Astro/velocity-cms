/**
 * Chooses the site each request is for, on a server that runs many sites from this one copy.
 * Compiled with the site, like every file here, so the site's bundler reads the file that knows
 * the sites; it runs first, before anything reads content.
 */
import { hostedRequest, useSiteRegistry } from '@velocity-astro/cms-astro';
import sites from 'virtual:velocity-cms/sites';

useSiteRegistry(sites);

export const onRequest = hostedRequest;
