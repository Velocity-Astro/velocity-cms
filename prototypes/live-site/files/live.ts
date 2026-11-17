/**
 * Live content for this template. Written into `src/lib/live.ts` by the prototype.
 *
 * `liveCollection` stands in for `getCollection`: same call, same entries, read from the CMS at
 * request time. The schemas are the ones the build-time collections already use.
 */
import { getLiveCollection } from 'astro:content';
import { liveCollections } from '@velocity/cms-astro';
import { siteCollections } from '@/config/collections';

const schemas = Object.fromEntries(Object.entries(siteCollections).map(([name, collection]) => [name, collection.schema]));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- prototype: typed entries come with generated types
export const liveCollection = liveCollections(getLiveCollection as any, schemas as any) as (
  name: keyof typeof siteCollections,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: (entry: any) => boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any[]>;
