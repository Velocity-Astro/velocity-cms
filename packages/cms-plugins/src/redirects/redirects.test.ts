import { createCms, type Actor, type Cms } from '@velocity-astro/cms-core';
import { FakeClock, InMemoryEntryRepository, InMemoryPluginStore, InMemorySchemaRepository, SequentialIds } from '@velocity-astro/cms-core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { catalogue } from '../index.js';
import { redirectFor, redirectKey } from './plugin.js';

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
let cms: Cms;

beforeEach(async () => {
  cms = createCms({ pluginStore: new InMemoryPluginStore(), entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
  await cms.plugins.load(catalogue);
});

const saveMoves = async (moves: Record<string, unknown>[]) => {
  const { fields } = await cms.plugins.settings(owner, 'redirects');
  const list = fields.find((field) => field.key === 'moves');
  const inner = (list?.options as { of: { options: { fields: { key: string; id: string }[] } } }).of.options.fields;
  const byId = (move: Record<string, unknown>) => Object.fromEntries(Object.entries(move).map(([key, value]) => [inner.find((field) => field.key === key)?.id ?? key, value]));
  await cms.plugins.saveSettings(owner, 'redirects', { [list?.id ?? 'moves']: moves.map(byId) });
};

describe('matching a move', () => {
  it('goes by the path alone, with or without its slash, in any case', () => {
    expect(redirectKey('/Old-Page/?utm=1#top')).toBe('/old-page');
    expect(redirectKey('/')).toBe('/');
    const moves = [{ from: '/old-page', to: '/new-page/' }, { from: '/later/', to: 'https://example.com/', temporary: true }];
    expect(redirectFor(moves, '/OLD-PAGE/')).toEqual({ to: '/new-page/', permanent: true });
    expect(redirectFor(moves, '/later')).toEqual({ to: 'https://example.com/', permanent: false });
    expect(redirectFor(moves, '/elsewhere/')).toBeUndefined();
  });

  it('never sends anyone to an address a page cannot hold', () => {
    expect(redirectFor([{ from: '/a/', to: 'javascript:alert(1)' }, { from: '/a/', to: '//evil.example/' }, { from: '/a/', to: 'http://plain.example/' }], '/a/')).toBeUndefined();
    expect(redirectFor([{ from: 'a/', to: '/b/' }], '/a/')).toBeUndefined();
  });
});

describe('the Redirects plugin', () => {
  it('moves a visitor from an address an owner listed, once it is switched on, and never to the same address', async () => {
    await saveMoves([{ from: '/old-page/', to: '/new-page/' }, { from: '/loop/', to: '/loop' }]);
    expect(await cms.pages.redirect('/old-page/')).toBeUndefined();
    await cms.plugins.setEnabled(owner, 'redirects', true);
    expect(await cms.pages.redirect('/old-page/')).toEqual({ to: '/new-page/', permanent: true });
    expect(await cms.pages.redirect('/loop/')).toBeUndefined();
    expect(await cms.pages.redirect('/nothing/')).toBeUndefined();
  });
});
