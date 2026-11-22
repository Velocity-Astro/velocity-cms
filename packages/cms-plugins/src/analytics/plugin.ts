import { CONSENT_MODES, definePlugin, isPageAddress, type ConsentMode, type PageAnalytics } from '@velocity-astro/cms-core';

const textOf = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const GA_ID = /^G-[A-Z0-9]{4,20}$/;
const GTM_ID = /^GTM-[A-Z0-9]{4,20}$/;

/** What the owner set, as ids a page may carry. Anything that is not one is left out, not guessed at. */
export function analyticsFrom(set: Readonly<Record<string, unknown>>): PageAnalytics {
  const googleAnalytics = textOf(set['googleAnalytics']).toUpperCase();
  const tagManager = textOf(set['tagManager']).toUpperCase();
  const consent = CONSENT_MODES.find((mode): mode is ConsentMode => mode === set['consent']);
  const privacyUrl = textOf(set['privacyUrl']);
  return {
    ...(GA_ID.test(googleAnalytics) && { googleAnalytics }),
    ...(GTM_ID.test(tagManager) && { tagManager }),
    ...(consent !== undefined && { consent }),
    ...(privacyUrl !== '' && isPageAddress(privacyUrl) && { privacyUrl }),
  };
}

/**
 * Analytics: which Google Analytics property and Tag Manager container the site is measured with,
 * and whether visitors are asked first. Every page is told the ids (`PageHead.analytics`) and the
 * template writes the tags it has, so nothing a plugin answers is ever a script. Changing them
 * here changes every page at once, with no deploy. Built on the plugin surface alone.
 */
export const analytics = definePlugin({
  name: 'analytics',
  apiVersion: 1,
  label: { en: 'Analytics' },
  description: { en: 'Measure the site with Google Analytics or Tag Manager, and ask visitors first with a cookie banner. Set the ids here and every page follows, with no deploy.' },
  version: '1.0.0',
  permissions: [],
  enabledByDefault: false,
  settings: [
    {
      key: 'googleAnalytics',
      type: 'text',
      label: { en: 'Google Analytics measurement ID' },
      help: { en: 'In Google Analytics: Admin, Data streams, your site. It starts with G-.' },
      options: { maxLength: 30 },
    },
    {
      key: 'tagManager',
      type: 'text',
      label: { en: 'Google Tag Manager container ID' },
      help: { en: 'Only if you use Tag Manager. It starts with GTM-.' },
      options: { maxLength: 30 },
    },
    {
      key: 'consent',
      type: 'select',
      label: { en: 'Ask visitors first' },
      help: { en: 'Leave empty to show no cookie banner.' },
      options: {
        choices: [...CONSENT_MODES],
        labels: {
          opt_out: { en: 'Measure until a visitor says no (asked first in Europe)' },
          consent_mode_v2: { en: 'Wait for a yes, with Google\'s cookieless pings' },
          strict: { en: 'Wait for a yes' },
        },
      },
    },
    {
      key: 'privacyUrl',
      type: 'text',
      label: { en: 'Privacy policy' },
      help: { en: 'Linked from the cookie banner: an address on this site, such as /privacy/, or one starting with https://.' },
      options: { maxLength: 500 },
    },
  ],
  setup(cms) {
    cms.pages.head(async () => {
      const ids = analyticsFrom(await cms.settings.get());
      return Object.keys(ids).length === 0 ? undefined : { analytics: ids };
    });
  },
});
