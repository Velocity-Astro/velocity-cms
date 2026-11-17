/**
 * The site's own page files, gathered by Vite. This file is compiled with the site, not with the
 * package, which is why it can see them.
 */
import { liveAddresses, type PageModule } from '@velocity/cms-astro';
import options from 'virtual:velocity-cms/options';

const localized = import.meta.glob<PageModule>('/src/live-pages/lang/*.astro', { eager: true });
const detail = import.meta.glob<PageModule>('/src/pages/*/[[]slug[]].astro', { eager: true });
const fixed = Object.keys(import.meta.glob('/src/pages/*.astro'));

export const addresses = () => liveAddresses({ fixed, detail, localized, unlisted: options.unlisted });
export const clientDir: string = options.clientDir;
