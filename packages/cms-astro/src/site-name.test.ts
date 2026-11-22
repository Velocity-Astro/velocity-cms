import type { Actor } from '@velocity-astro/cms-core';
import { expect, it } from 'vitest';
import { connect } from './connection.js';
import { siteBrandNow, siteNameNow } from './site-name.js';

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

it('reads the site\'s look from the fields its settings name, as published', async () => {
  const { cms } = await connect({ url: ':memory:' });
  expect(await siteBrandNow(cms)).toEqual({});
  const type = await cms.schema.define(owner, {
    key: 'settings',
    kind: 'single',
    label: { en: 'Site details' },
    fields: [...fields, { key: 'logo', type: 'image', label: { en: 'Logo' } }, { key: 'brand', type: 'color', label: { en: 'Brand colour' } }],
    inSettings: true,
    brandFields: { logo: 'logo', color: 'brand' },
  });
  const [, logo, colour] = type.fields.map((field) => field.id);
  const entry = await cms.content.create(owner, { typeId: type.id, locale: 'en', slug: 'settings', data: { [logo ?? '']: 'mark', [colour ?? '']: '#0A7CFF' } });
  expect(await siteBrandNow(cms)).toEqual({});
  await cms.content.publish(owner, entry.id);
  expect(await siteBrandNow(cms)).toEqual({ logo: 'mark', color: '#0A7CFF' });
});

it('refuses brand fields of the wrong kind, or on a page outside the settings', async () => {
  const { cms } = await connect({ url: ':memory:' });
  const define = (brandFields: object, inSettings = true) =>
    cms.schema.define(owner, { key: 'settings', kind: 'single', label: { en: 'Site details' }, fields, inSettings, brandFields } as never);
  await expect(define({ logo: 'name' })).rejects.toMatchObject({ code: 'validation_failed', message: expect.stringContaining('"image"') });
  await expect(define({ color: 'name' }, false)).rejects.toMatchObject({ code: 'validation_failed' });
});
