import type { Actor } from '@velocity-astro/cms-core';
import { expect, it } from 'vitest';
import { connect } from './connection.js';
import { siteNameNow } from './site-name.js';

const owner: Actor = { kind: 'cli', id: 'installer', role: 'owner' };
const fields = [{ key: 'name', type: 'text', label: { en: 'Business name' } }];

it('calls the site what is published on the page of the settings that names it, and never by a draft', async () => {
  const { cms } = await connect({ url: ':memory:' });
  const type = await cms.schema.define(owner, { key: 'settings', kind: 'single', label: { en: 'Business details' }, fields, inSettings: true, siteNameField: 'name' });
  const name = type.fields[0]?.id ?? '';
  // Nothing says yet, so the name from the site's code stands.
  expect(await siteNameNow(cms)).toBeNull();
  await cms.settings.saveGeneral(owner, { siteName: 'Saved under General', expectedRevision: 0 });
  expect(await siteNameNow(cms)).toBe('Saved under General');

  const entry = await cms.content.create(owner, { typeId: type.id, locale: 'en', slug: 'settings', data: { [name]: 'Oakhaven Homes' } });
  expect(await siteNameNow(cms)).toBe('Saved under General');
  await cms.content.publish(owner, entry.id);
  expect(await siteNameNow(cms)).toBe('Oakhaven Homes');

  // A change waits for its publish, and another language never renames the site.
  const changed = await cms.content.update(owner, entry.id, { data: { [name]: 'Oakhaven Realty' }, expectedRevision: entry.revision + 1 });
  expect(await siteNameNow(cms)).toBe('Oakhaven Homes');
  const spanish = await cms.content.create(owner, { typeId: type.id, locale: 'es', slug: 'ajustes', data: { [name]: 'Casas Oakhaven' }, translationGroup: entry.translationGroup });
  await cms.content.publish(owner, spanish.id);
  await cms.content.publish(owner, changed.id);
  expect(await siteNameNow(cms)).toBe('Oakhaven Realty');

  // Off the site, the page says nothing.
  await cms.content.unpublish(owner, changed.id);
  await cms.content.unpublish(owner, spanish.id);
  expect(await siteNameNow(cms)).toBe('Saved under General');
});

it('is what an owner saved where no page names the site', async () => {
  const { cms } = await connect({ url: ':memory:' });
  await cms.schema.define(owner, { key: 'settings', kind: 'single', label: { en: 'Site settings' }, fields });
  expect(await siteNameNow(cms)).toBeNull();
  await cms.settings.saveGeneral(owner, { siteName: 'Lakeshore', expectedRevision: 0 });
  expect(await siteNameNow(cms)).toBe('Lakeshore');
});
