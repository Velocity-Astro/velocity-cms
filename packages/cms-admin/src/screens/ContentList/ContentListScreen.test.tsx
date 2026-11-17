import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { AdminApp } from '../../app/AdminApp.js';
import { MemoryAdminClient } from '../../testing/memory-client.js';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleEntries, sampleUser } from '../../testing/sample-content.js';

const signedIn = { user: sampleUser, contentTypes: sampleContentTypes, entries: sampleEntries() };

it('opens on the first content type, with every type in the navigation', async () => {
  renderApp('/', signedIn);
  expect(await screen.findByRole('heading', { level: 1, name: 'Agents' })).toBeTruthy();
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Agents', 'Listings']);
  expect(within(nav).getByRole('link', { name: 'Agents' }).getAttribute('aria-current')).toBe('page');
});

it('lists a type\'s entries, newest first, with a title, a state and when each was updated', async () => {
  renderApp('/content/listings', signedIn);
  const table = await screen.findByRole('grid', { name: 'Listings' });
  const rows = within(table).getAllByRole('row').slice(1).map((row) => Array.from(row.children, (cell) => cell.textContent));
  expect(rows).toEqual([
    ['6214 Lakeshore Drive/listings/6214-lakeshore-drive', 'Published', '2 hours ago'],
    ['18 Alder Court/listings/18-alder-court', 'Draft', 'yesterday'],
    ['907 Mesa Verde Lane/listings/907-mesa-verde-lane', 'Unpublished changes', '3 days ago'],
    ['Untitled/listings/e4', 'Draft', '8 days ago'],
  ]);
  expect(screen.getByText('4 entries')).toBeTruthy();
});

it('shows an entry in two languages as one row that names both', async () => {
  const [first, ...rest] = sampleEntries();
  if (!first) throw new Error('No sample entries.');
  const spanish = { ...first, id: 'e-es', locale: 'es', slug: 'paseo-del-lago' };
  renderApp('/content/listings', { ...signedIn, entries: [spanish, first, ...rest] });
  const table = await screen.findByRole('grid', { name: 'Listings' });
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Title', 'Status', 'Languages', 'Updated']);
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(4);
  // The row shows the version in the editor's language, whichever came first.
  expect(rows[0]?.children[0]?.textContent).toBe('6214 Lakeshore Drive/listings/6214-lakeshore-drive');
  expect(rows.map((row) => row.children[2]?.textContent)).toEqual(['ENES', 'EN', 'EN', 'EN']);
  expect(screen.getByText('4 entries')).toBeTruthy();
});

it('narrows the list by state and by what is typed, and says when nothing matches', async () => {
  const user = userEvent.setup();
  renderApp('/content/listings', signedIn);
  const table = await screen.findByRole('grid', { name: 'Listings' });
  const titles = () => within(screen.getByRole('grid', { name: 'Listings' })).getAllByRole('rowheader').map((cell) => cell.textContent);
  expect(within(table).getAllByRole('rowheader')).toHaveLength(4);

  await user.click(screen.getByRole('radio', { name: 'Drafts' }));
  expect(titles()).toEqual(['18 Alder Court/listings/18-alder-court', 'Untitled/listings/e4']);

  await user.type(screen.getByRole('searchbox', { name: 'Search listings' }), 'alder');
  expect(titles()).toEqual(['18 Alder Court/listings/18-alder-court']);

  await user.type(screen.getByRole('searchbox', { name: 'Search listings' }), 'zzz');
  expect(await screen.findByRole('heading', { name: 'Nothing matches' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(titles()).toHaveLength(2);
});

it('moves between types from the navigation without leaving the app', async () => {
  const user = userEvent.setup();
  renderApp('/content/listings', signedIn);
  await user.click(await screen.findByRole('link', { name: 'Agents' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Agents' })).toBeTruthy();
  expect(await screen.findByRole('heading', { level: 2, name: 'No agents yet' })).toBeTruthy();
});

it('says so when the address names a type that does not exist', async () => {
  renderApp('/content/unicorns', signedIn);
  expect(await screen.findByRole('heading', { name: 'This content type does not exist' })).toBeTruthy();
});

it('explains what a content type is when the site has none', async () => {
  renderApp('/', { user: sampleUser });
  expect(await screen.findByRole('heading', { name: 'No content types yet' })).toBeTruthy();
});

it('shows what went wrong and tries again when asked', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings', signedIn);
  await screen.findByRole('grid', { name: 'Listings' });
  client.failNextWith = 'The server did not answer.';
  await user.click(screen.getByRole('link', { name: 'Agents' }));
  expect(await screen.findByText('The server did not answer.')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { level: 2, name: 'No agents yet' })).toBeTruthy();
});

it('signs out from the account menu and returns to the sign-in screen', async () => {
  const user = userEvent.setup();
  renderApp('/content/listings', signedIn);
  await user.click(await screen.findByRole('button', { name: /^Account\s*Dana/ }));
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
});

it('shows labels in the language asked for', async () => {
  render(<AdminApp client={new MemoryAdminClient(signedIn)} siteName="Lakeshore" locale="es-ES" initialPath="/content/listings" />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Propiedades' })).toBeTruthy();
  expect(await screen.findByText('hace 2 horas')).toBeTruthy();
});
