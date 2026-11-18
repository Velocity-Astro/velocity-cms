/**
 * The blocks a page can be built from in the editor, by the key the CMS knows each one by.
 * Written into `src/cms/blocks.ts` by the prototype.
 *
 * Each is a small component in src/components/cms/blocks/ that takes a section's values as props
 * and draws them with the template's own parts, so a page built in the editor looks like one
 * built in code. The fields of each block are described in the CMS model, under the same key.
 */
import CallToAction from '@/components/cms/blocks/CallToAction.astro';
import FeatureGrid from '@/components/cms/blocks/FeatureGrid.astro';
import FeatureSplit from '@/components/cms/blocks/FeatureSplit.astro';
import Image from '@/components/cms/blocks/Image.astro';
import PageHero from '@/components/cms/blocks/PageHero.astro';
import Questions from '@/components/cms/blocks/Questions.astro';
import Stats from '@/components/cms/blocks/Stats.astro';
import Text from '@/components/cms/blocks/Text.astro';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each block checks its own props
export const blocks: Record<string, (props: any) => any> = {
  'page-hero': PageHero,
  text: Text,
  image: Image,
  'feature-grid': FeatureGrid,
  'feature-split': FeatureSplit,
  stats: Stats,
  questions: Questions,
  'call-to-action': CallToAction,
};

/** One section of a page as the CMS hands it over. */
export interface Section {
  id: string;
  block: string;
  data: Record<string, unknown>;
}

/** Text someone shaped in the editor: HTML the CMS made from it, every word escaped. */
export interface RichText {
  html: string;
  paragraphs: string[];
}

/**
 * Where a button made in the editor may lead: a page of this site, or a web, mail or phone
 * address. Anything else (a script, a file on the visitor's computer) is no link at all.
 */
export function safeLink(link: string | undefined): string | undefined {
  const href = link?.trim();
  if (!href) return undefined;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  return /^(https:\/\/|mailto:|tel:)/i.test(href) ? href : undefined;
}
