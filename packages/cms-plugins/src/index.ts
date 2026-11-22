import type { PluginDefinition } from '@velocity-astro/cms-core';
import { analytics, analyticsFrom } from './analytics/plugin.js';
import { redirects, redirectFor, redirectKey } from './redirects/plugin.js';
import { hubspot } from './hubspot/plugin.js';
import { mailchimp, mailchimpHost } from './mailchimp/plugin.js';
import { seo } from './seo/plugin.js';
import { slack, slackAddress } from './slack/plugin.js';
import { webhooks } from './webhooks/plugin.js';

export { analytics, analyticsFrom, hubspot, mailchimp, mailchimpHost, redirects, redirectFor, redirectKey, slack, slackAddress };
export { seo } from './seo/plugin.js';
export { webhooks, deliveryAddress } from './webhooks/plugin.js';
export { analyse, type SeoAnalysis, type SeoConfig, type SeoProblem } from './seo/analyse.js';

/**
 * The plugins that come with Velocity CMS. Every site loads them, each switched off until an
 * owner activates it under Plugins, so nobody needs a developer to add one. A plugin joins this
 * list when it is built on the plugin surface alone and says `enabledByDefault: false`.
 */
export const catalogue: readonly PluginDefinition[] = [seo, analytics, redirects, webhooks, mailchimp, slack, hubspot];
