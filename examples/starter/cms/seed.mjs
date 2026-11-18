#!/usr/bin/env node
/**
 * Tells the CMS about this site's content (cms/model.mjs) and, in an empty database, adds the
 * sample pages, a post, the contact form and the menu.
 *
 *   npm run seed
 *
 * Safe to run again, and on every deploy: the content types are made to match the model, fields
 * keep their ids, and nothing that was edited is touched.
 */
import { randomUUID } from 'node:crypto';
import { sharedConnection } from '@velocity/cms-astro';
import { toStoredData } from '@velocity/cms-core';
import { forms, model, sampleMenu, samplePages, samplePosts } from './model.mjs';

const SEED = { kind: 'cli', id: 'seed', role: 'owner' };
const connection = await sharedConnection({});
const { cms } = connection;
try {
  const isNew = (await cms.schema.list()).length === 0;
  const types = new Map();
  for (const type of model) types.set(type.key, await cms.schema.define(SEED, type));
  console.log(`Content types match cms/model.mjs: ${[...types.keys()].join(', ')}.`);
  if (!isNew) {
    console.log('The database already has content, so no samples were added.');
  } else {
    for (const form of forms) await cms.forms.create(SEED, form);
    const made = await cms.forms.list(SEED);
    const publish = async (type, { slug, ...values }) => {
      const draft = await cms.content.create(SEED, { typeId: type.id, locale: 'en', slug, data: toStoredData(type.fields, values, randomUUID) });
      return cms.content.publish(SEED, draft.id);
    };
    /** A sample page names its form by key; the CMS keeps the form's id. */
    const withForms = (body) => body.map((section) => (section.block === 'form' ? { ...section, data: { ...section.data, form: made.find((form) => form.key === section.data.form)?.id } } : section));
    const pages = new Map();
    for (const page of samplePages) pages.set(page.slug, await publish(types.get('pages'), { ...page, body: withForms(page.body) }));
    for (const post of samplePosts) await publish(types.get('posts'), post);
    const header = sampleMenu.map(({ label, href, page }) => ({ label, link: href ? { kind: 'address', href } : { kind: 'entry', type: 'pages', entry: pages.get(page).translationGroup } }));
    await publish(types.get('navigation'), { slug: 'navigation', header });
    console.log(`Added ${samplePages.length} pages, ${samplePosts.length} post, the contact form and the menu.`);
  }
} finally {
  connection.close();
}
