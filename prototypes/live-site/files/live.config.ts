import { defineLiveCollection } from 'astro:content';
import { cmsLiveLoader } from '@velocity/cms-astro';

// No schemas here: this file must not import anything that imports astro:content, or the build
// hangs. src/lib/live.ts checks entries against the template's schemas instead.
export const collections = {
  listingsLive: defineLiveCollection({ loader: cmsLiveLoader({ type: 'listings' }) }),
  agentsLive: defineLiveCollection({ loader: cmsLiveLoader({ type: 'agents' }) }),
  neighborhoodsLive: defineLiveCollection({ loader: cmsLiveLoader({ type: 'neighborhoods' }) }),
  reviewsLive: defineLiveCollection({ loader: cmsLiveLoader({ type: 'reviews' }) }),
};
