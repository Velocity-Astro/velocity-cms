import { definePlugin } from '@velocity/cms-core';
import { screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleUser } from '../../testing/sample-content.js';

const site = (options = {}) => ({ user: sampleUser, contentTypes: sampleContentTypes, ...options });

const plugins = [
  definePlugin({ name: 'ratings', apiVersion: 1, label: { en: 'Ratings' }, description: { en: 'Stars for reviews.' }, version: '1.2.0', permissions: ['entry:read', 'entry:write'], setup: () => undefined }),
  definePlugin({
    name: 'scores',
    apiVersion: 1,
    label: { en: 'Scores' },
    setup: () => {
      throw new Error('No API key.');
    },
  }),
  { name: 'future', apiVersion: 2, label: { en: 'Future' }, setup: () => undefined },
];

it('lists each plugin with its state, what it may do, and why one is off', async () => {
  renderApp('/plugins', site({ plugins }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Plugins' })).toBeTruthy();

  const ratings = within(await screen.findByRole('row', { name: /Ratings/ }));
  expect(ratings.getByText('On')).toBeTruthy();
  expect(ratings.getByText('Version 1.2.0')).toBeTruthy();
  expect(ratings.getByText('Stars for reviews.')).toBeTruthy();
  expect(ratings.getByText('Read content, Write drafts')).toBeTruthy();

  const scores = within(screen.getByRole('row', { name: /Scores/ }));
  expect(scores.getByText('Switched off')).toBeTruthy();
  expect(scores.getByText('The plugin "scores" could not start, so it is switched off: No API key.')).toBeTruthy();
  expect(scores.getByText('Change nothing')).toBeTruthy();

  const future = within(screen.getByRole('row', { name: /Future/ }));
  expect(future.getByText('Needs another version')).toBeTruthy();
});

it('says how plugins get here when the site has none', async () => {
  renderApp('/plugins', site());
  expect(await screen.findByText('No plugins yet')).toBeTruthy();
});

it('is for owners: an editor has no way in and is told why', async () => {
  renderApp('/plugins', site({ user: { ...sampleUser, role: 'editor' as const } }));
  expect(await screen.findByText(/does not allow/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Plugins' })).toBeNull();
});
