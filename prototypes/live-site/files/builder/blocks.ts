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
import Form from '@/components/cms/blocks/Form.astro';
import FeatureSplit from '@/components/cms/blocks/FeatureSplit.astro';
import HomeHero from '@/components/cms/blocks/HomeHero.astro';
import Image from '@/components/cms/blocks/Image.astro';
import Journal from '@/components/cms/blocks/Journal.astro';
import ListingSpotlight from '@/components/cms/blocks/ListingSpotlight.astro';
import Listings from '@/components/cms/blocks/Listings.astro';
import Neighborhoods from '@/components/cms/blocks/Neighborhoods.astro';
import PageHero from '@/components/cms/blocks/PageHero.astro';
import PhotoPoints from '@/components/cms/blocks/PhotoPoints.astro';
import Questions from '@/components/cms/blocks/Questions.astro';
import Reviews from '@/components/cms/blocks/Reviews.astro';
import Services from '@/components/cms/blocks/Services.astro';
import Stats from '@/components/cms/blocks/Stats.astro';
import Steps from '@/components/cms/blocks/Steps.astro';
import Team from '@/components/cms/blocks/Team.astro';
import Text from '@/components/cms/blocks/Text.astro';
import Valuation from '@/components/cms/blocks/Valuation.astro';

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
  'home-hero': HomeHero,
  services: Services,
  'listing-spotlight': ListingSpotlight,
  listings: Listings,
  'photo-points': PhotoPoints,
  neighborhoods: Neighborhoods,
  steps: Steps,
  reviews: Reviews,
  valuation: Valuation,
  journal: Journal,
  form: Form,
  team: Team,
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

