/**
 * The sections a page can be built from, by the key the CMS knows each one by (cms/model.mjs).
 * Each component takes a section's values as props. To add a kind of section, describe it in the
 * model, write its component, and name it here.
 */
import type { linkTo } from '@velocity-astro/cms-astro';
import CallToAction from './blocks/CallToAction.astro';
import Features from './blocks/Features.astro';
import Form from './blocks/Form.astro';
import Hero from './blocks/Hero.astro';
import Text from './blocks/Text.astro';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each block says what it takes
export const blocks: Record<string, (props: any) => any> = { hero: Hero, text: Text, features: Features, 'call-to-action': CallToAction, form: Form };

/** One section of a page as the CMS hands it over. */
export interface Section {
  id: string;
  block: string;
  data: Record<string, unknown>;
}

/** Text someone shaped in the editor: HTML the CMS made from it, every word escaped. */
export interface RichText {
  html: string;
}

/** A link chosen in the editor: a page of the site or a typed address. `linkTo` says where it leads. */
export type Link = Parameters<typeof linkTo>[1];
