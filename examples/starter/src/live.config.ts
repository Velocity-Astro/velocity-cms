import { defineLiveCollection } from 'astro:content';
import { cmsLiveLoader } from '@velocity-astro/cms-astro';

// Posts are read from the CMS as pages are asked for, so a publish shows at once.
export const collections = {
  posts: defineLiveCollection({ loader: cmsLiveLoader({ type: 'posts' }) }),
};
