import { createCms, type Actor, type Cms } from '@velocity-astro/cms-core';
import { FakeClock, InMemoryEntryRepository, InMemoryPluginStore, InMemorySchemaRepository, SequentialIds } from '@velocity-astro/cms-core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { catalogue } from '../index.js';
import { analyticsFrom } from './plugin.js';

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
let cms: Cms;

beforeEach(async () => {
  cms = createCms({ pluginStore: new InMemoryPluginStore(), entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
  await cms.plugins.load(catalogue);
});

const settings = async (values: Record<string, unknown>) => {
  const { fields } = await cms.plugins.settings(owner, 'analytics');
  await cms.plugins.saveSettings(owner, 'analytics', Object.fromEntries(Object.entries(values).map(([key, value]) => [fields.find((field) => field.key === key)?.id ?? key, value])));
};

describe('the ids a page is measured with', () => {
  it('takes only real ids and an address a page can hold', () => {
    expect(analyticsFrom({ googleAnalytics: ' g-abc1234 ', tagManager: 'GTM-XYZ12', consent: 'strict', privacyUrl: '/privacy/' })).toEqual({ googleAnalytics: 'G-ABC1234', tagManager: 'GTM-XYZ12', consent: 'strict', privacyUrl: '/privacy/' });
    expect(analyticsFrom({ googleAnalytics: 'UA-1"><script>', tagManager: 'G-NOTGTM', consent: 'always', privacyUrl: 'javascript:alert(1)' })).toEqual({});
    expect(analyticsFrom({ privacyUrl: '//elsewhere.example/' })).toEqual({});
  });
});

describe('the Analytics plugin', () => {
  it('comes switched off, then tells every page the ids an owner set', async () => {
    expect((await cms.plugins.list(owner)).find((plugin) => plugin.name === 'analytics')?.status).toBe('off');
    await settings({ googleAnalytics: 'G-XSXKTE2W15', consent: 'consent_mode_v2' });
    const page = { path: '/', locale: 'en' };
    expect(await cms.pages.run(page, { title: 'Home' })).toEqual({ title: 'Home' });

    await cms.plugins.setEnabled(owner, 'analytics', true);
    expect(await cms.pages.run(page, { title: 'Home' })).toEqual({ title: 'Home', analytics: { googleAnalytics: 'G-XSXKTE2W15', consent: 'consent_mode_v2' } });

    await cms.plugins.setEnabled(owner, 'analytics', false);
    expect(await cms.pages.run(page, { title: 'Home' })).toEqual({ title: 'Home' });
  });
});
