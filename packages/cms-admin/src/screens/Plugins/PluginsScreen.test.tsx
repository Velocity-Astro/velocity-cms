import { definePlugin } from '@velocity/cms-core';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
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
  expect(ratings.getByText('Active')).toBeTruthy();
  expect(ratings.getByText('Version 1.2.0')).toBeTruthy();
  expect(ratings.getByText('Stars for reviews.')).toBeTruthy();
  expect(ratings.getByText('Read content, Write drafts')).toBeTruthy();

  const scores = within(screen.getByRole('row', { name: /Scores/ }));
  expect(scores.getByText('Could not start')).toBeTruthy();
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
  expect(screen.queryByRole('link', { name: 'Manage plugins' })).toBeNull();
});

const seo = () =>
  definePlugin({
    name: 'seo',
    apiVersion: 1,
    label: { en: 'SEO' },
    description: { en: 'Titles and descriptions for search engines.' },
    // It ships with the CMS, so it waits for an owner.
    enabledByDefault: false,
    settings: [
      { key: 'titleSuffix', type: 'text', label: { en: 'Title ending' }, help: { en: 'Added to every page title.' }, required: true },
      { key: 'maxLength', type: 'number', label: { en: 'Longest description' } },
    ],
    setup: () => undefined,
  });

it('lets an owner activate an available plugin and switch it off again, with no developer', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/plugins', site({ plugins: [seo()] }));
  const row = within(await screen.findByRole('row', { name: /SEO/ }));
  expect(row.getByText('Available')).toBeTruthy();

  await user.click(row.getByRole('switch', { name: 'SEO is active' }));
  expect(await screen.findByText('It is running on the whole site now.')).toBeTruthy();
  expect(await row.findByText('Active')).toBeTruthy();
  expect((await client.listPlugins())[0]?.status).toBe('on');

  await user.click(row.getByRole('switch', { name: 'SEO is active' }));
  expect(await screen.findByText('SEO was switched off')).toBeTruthy();
  expect(await row.findByText('Available')).toBeTruthy();
});

it('says why when a plugin cannot start, and leaves it off', async () => {
  const user = userEvent.setup();
  const broken = definePlugin({
    name: 'scores',
    apiVersion: 1,
    label: { en: 'Scores' },
    enabledByDefault: false,
    setup: () => {
      throw new Error('No API key.');
    },
  });
  renderApp('/plugins', site({ plugins: [broken] }));
  const row = within(await screen.findByRole('row', { name: /Scores/ }));
  await user.click(row.getByRole('switch', { name: 'Scores is active' }));
  expect(await screen.findByText('Scores could not start')).toBeTruthy();
  expect(await row.findByText('Could not start')).toBeTruthy();
});

it('draws a plugin\'s settings as a form, shows what the server says on each, and saves', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/plugins', site({ plugins: [seo()] }));
  await user.click(await screen.findByRole('button', { name: 'Settings for SEO' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'SEO settings' }));
  expect(await dialog.findByText('Added to every page title.')).toBeTruthy();

  await user.type(await dialog.findByRole('textbox', { name: /Longest description/ }), '160');
  await user.click(dialog.getByRole('button', { name: 'Save settings' }));
  expect(await dialog.findByText('Fill this in.')).toBeTruthy();
  // What was typed is still there after the refusal.
  expect(dialog.getByRole('textbox', { name: /Longest description/ })).toHaveProperty('value', '160');

  await user.type(dialog.getByRole('textbox', { name: /Title ending/ }), ' | Lakeshore');
  await user.click(dialog.getByRole('button', { name: 'Save settings' }));
  expect(await screen.findByText('SEO settings saved')).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'SEO settings' })).toBeNull());
  const saved = await client.getPluginSettings('seo');
  expect(Object.values(saved.values)).toEqual([' | Lakeshore', 160]);
});

/** A plugin that asks for a key and sends things, as a connector would. */
const mailer = (state: { works: boolean; add?: () => Promise<void> }) =>
  definePlugin({
    name: 'mailer',
    apiVersion: 1,
    label: { en: 'Mailer' },
    secrets: [{ key: 'apiKey', label: { en: 'API key' }, help: { en: 'From your account page.' } }],
    setup(plugin) {
      plugin.tasks.define('send', () => {
        if (!state.works) throw new Error('The service answered 500.');
      });
      state.add = () => plugin.tasks.add('send', { to: 'carried@example.com' }, { label: 'Welcome message' });
    },
  });

it('saves a key by itself, shows only that one is saved, and takes it away again', async () => {
  const user = userEvent.setup();
  renderApp('/plugins', site({ plugins: [mailer({ works: true })] }));
  await user.click(await screen.findByRole('button', { name: 'Settings for Mailer' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Mailer settings' }));
  const field = await dialog.findByLabelText(/^API key/);
  expect(dialog.getByText('From your account page.')).toBeTruthy();
  expect((dialog.getByRole('button', { name: 'Save API key' }) as HTMLButtonElement).disabled).toBe(true);

  await user.type(field, 'sk-12345');
  await user.click(dialog.getByRole('button', { name: 'Save API key' }));
  expect(await dialog.findByText('Saved. It is not shown again.')).toBeTruthy();
  expect(await screen.findByText('API key saved')).toBeTruthy();
  // The field and what was typed are gone from the page.
  expect(dialog.queryByLabelText(/^API key/)).toBeNull();
  expect(document.body.innerHTML).not.toContain('sk-12345');

  await user.click(dialog.getByRole('button', { name: 'Replace API key' }));
  expect(((await dialog.findByLabelText(/^API key/)) as HTMLInputElement).value).toBe('');
  await user.click(dialog.getByRole('button', { name: 'Keep the saved one' }));
  await user.click(await dialog.findByRole('button', { name: 'Remove API key' }));
  expect(await dialog.findByLabelText(/^API key/)).toBeTruthy();
  expect(await screen.findByText('API key removed')).toBeTruthy();
});

it('shows what a plugin was asked to do, with why something still waits', async () => {
  const user = userEvent.setup();
  const state: { works: boolean; add?: () => Promise<void> } = { works: false };
  renderApp('/plugins', site({ plugins: [mailer(state)] }));
  const row = within(await screen.findByRole('row', { name: /Mailer/ }));
  expect(row.getByText(/deliveries that are tried again when they fail/)).toBeTruthy();

  await user.click(row.getByRole('button', { name: 'Activity of Mailer' }));
  const empty = within(await screen.findByRole('dialog', { name: 'Mailer activity' }));
  expect(await empty.findByText('Nothing yet')).toBeTruthy();
  await user.click(empty.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mailer activity' })).toBeNull());

  await state.add?.();
  state.works = true;
  await state.add?.();
  await user.click(row.getByRole('button', { name: 'Activity of Mailer' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Mailer activity' }));
  const rows = await dialog.findAllByRole('row', { name: /Welcome message/ });
  expect(rows).toHaveLength(2);
  expect(rows.filter((candidate) => within(candidate).queryByText('Done') !== null)).toHaveLength(1);
  const waiting = within(rows.find((candidate) => within(candidate).queryByText('Waiting') !== null) as HTMLElement);
  expect(waiting.getByText('Waiting')).toBeTruthy();
  expect(waiting.getByText('The service answered 500.')).toBeTruthy();
  expect(waiting.getByText('Tried once. Next try within a minute')).toBeTruthy();
  // What it carried is never on the page.
  expect(document.body.innerHTML).not.toContain('carried@example.com');
});
