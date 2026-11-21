import { definePlugin } from '@velocity-astro/cms-core';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import type { PluginEditorApi, PluginEditorLoader } from '../../plugins/plugin-editor.js';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleEntries, sampleUser } from '../../testing/sample-content.js';

const site = (options = {}) => ({ user: sampleUser, contentTypes: sampleContentTypes, entries: sampleEntries(), ...options });

/** A plugin as a site would have it: a count kept on the server, and an editor file that shows it. */
const counter = () =>
  definePlugin({
    name: 'counter',
    apiVersion: 1,
    label: { en: 'Counter' },
    editor: 'served by the site',
    setup(plugin) {
      plugin.routes.add('GET', '/count', async () => ({ count: (await plugin.store.get('count')) ?? 0 }));
      plugin.routes.add('POST', '/count', async () => {
        const count = Number((await plugin.store.get('count')) ?? 0) + 1;
        await plugin.store.set('count', count);
        return { count };
      });
    },
  });

/** What that plugin's editor file would do, written as its author would: with what it is handed and nothing else. */
function counterEditor({ React, ui, client, register }: PluginEditorApi) {
  const h = React.createElement;
  function CounterScreen() {
    const [count, setCount] = React.useState<number | null>(null);
    React.useEffect(() => void client.get('/count').then((answer) => setCount((answer as { count: number }).count)), []);
    return h(
      ui.Stack,
      { gap: 4 },
      h(ui.Text, null, count === null ? 'Counting' : `Counted ${count}`),
      h(ui.Button, { onPress: () => void client.post('/count').then((answer) => setCount((answer as { count: number }).count)), children: 'Count one more' }),
    );
  }
  function Broken(): never {
    throw new Error('The plugin lost its place.');
  }
  register.screen({ id: 'count', label: 'Counter', description: 'How many times the button was pressed.', Component: CounterScreen });
  register.screen({ id: 'broken', label: 'Broken screen', Component: Broken });
  register.entryPanel({
    id: 'length',
    title: 'Length',
    types: ['listings'],
    Component: ({ data, type }) => h(ui.Text, null, `${Object.keys(data).length} of ${type.fields.length} fields filled in`),
  });
  register.entryPanel({ id: 'address', title: 'Where it is', pagesOnly: true, Component: ({ type }) => h(ui.Text, null, type.urlPattern ?? '') });
}

const editors: PluginEditorLoader = async (name) => {
  if (name !== 'counter') throw new Error(`No file for ${name}.`);
  return { default: counterEditor };
};

it('gives a plugin\'s screen a place in the sidebar, and lets it talk to its own addresses', async () => {
  const user = userEvent.setup();
  renderApp('/', site({ plugins: [counter()] }), editors);

  // The rail's Plugins opens the first screen a plugin added.
  await user.click(await screen.findByRole('link', { name: 'Plugins' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Counter' })).toBeTruthy();
  await user.click(await screen.findByRole('link', { name: 'Counter' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Counter' })).toBeTruthy();
  // Plugins have a section of their own on the rail: their screens, then the way to manage them, in its column.
  const rail = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link').map((link) => link.textContent);
  expect(rail.slice(-2)).toEqual(['Plugins', 'Settings']);
  const links = within(screen.getByRole('navigation', { name: 'Plugins' })).getAllByRole('link').map((link) => link.textContent);
  expect(links).toEqual(['Counter', 'Broken screen', 'Manage plugins']);
  expect(screen.getByText('How many times the button was pressed.')).toBeTruthy();
  expect(await screen.findByText('Counted 0')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Count one more' }));
  expect(await screen.findByText('Counted 1')).toBeTruthy();
});

it('keeps a plugin\'s fault to its own part of the screen, with a way to try again', async () => {
  renderApp('/plugins/counter/broken', site({ plugins: [counter()] }), editors);
  expect(await screen.findByText('The plugin lost its place.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  // The frame around it carries on.
  expect(screen.getByRole('link', { name: 'Media' })).toBeTruthy();
});

it('says so at the address of a screen no plugin added', async () => {
  renderApp('/plugins/counter/nothing', site({ plugins: [counter()] }), editors);
  expect(await screen.findByText('This screen is not here')).toBeTruthy();
});

it('shows a plugin\'s panel beside an entry of the types it names', async () => {
  const entries = sampleEntries();
  const listing = entries.find((entry) => entry.typeId === sampleContentTypes.find((type) => type.key === 'listings')?.id);
  renderApp(`/content/listings/${listing?.id ?? ''}`, site({ plugins: [counter()], entries }), editors);
  const panel = within((await screen.findByRole('heading', { name: 'Length' })).closest('section') ?? document.body);
  expect(panel.getByText(/fields filled in/)).toBeTruthy();
  // A panel for pages shows on an entry that has a page of its own.
  expect(await screen.findByRole('heading', { name: 'Where it is' })).toBeTruthy();
});

it('leaves a panel for pages off an entry with no page of its own', async () => {
  const entries = sampleEntries();
  const listing = entries.find((entry) => entry.typeId === sampleContentTypes.find((type) => type.key === 'listings')?.id);
  // Listings as a site might keep them for a list on another page: no address of their own.
  const contentTypes = sampleContentTypes.map(({ urlPattern, ...type }) => (type.key === 'listings' ? type : { ...type, ...(urlPattern !== undefined && { urlPattern }) }));
  renderApp(`/content/listings/${listing?.id ?? ''}`, site({ plugins: [counter()], entries, contentTypes }), editors);
  expect(await screen.findByRole('heading', { name: 'Length' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Where it is' })).toBeNull();
});

it('says on the Plugins screen what an active plugin adds, and opens its screen from there', async () => {
  const user = userEvent.setup();
  renderApp('/plugins', site({ plugins: [counter()] }), editors);
  const row = within(await screen.findByRole('region', { name: /Counter/ }));
  expect(row.getByText('Adds the "Counter" screen in the sidebar, the "Broken screen" screen in the sidebar, the "Length" panel on entries, the "Where it is" panel on entries.')).toBeTruthy();
  await user.click(row.getByRole('button', { name: 'Open Counter' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Counter' })).toBeTruthy();
});

it('takes a plugin\'s screens away when an owner switches it off, and brings them back', async () => {
  const user = userEvent.setup();
  renderApp('/plugins', site({ plugins: [counter()] }), editors);
  await user.click(await screen.findByRole('switch', { name: 'Counter is active' }));
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Counter' })).toBeNull());
  await user.click(screen.getByRole('switch', { name: 'Counter is active' }));
  expect(await screen.findByRole('link', { name: 'Counter' })).toBeTruthy();
});

it('carries on without a plugin whose editor file cannot be loaded, and tells the owner', async () => {
  renderApp('/plugins', site({ plugins: [counter()] }), async () => {
    throw new Error('The file was not found.');
  });
  const row = within(await screen.findByRole('region', { name: /Counter/ }));
  expect(row.getByText('Its part of the editor could not be loaded: The file was not found.')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Counter' })).toBeNull();
});
