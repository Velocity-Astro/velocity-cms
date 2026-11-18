import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { AdminApp } from '../../app/AdminApp.js';
import { MemoryAdminClient } from '../../testing/memory-client.js';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleEntries, sampleUser } from '../../testing/sample-content.js';

const signedIn = { user: sampleUser, contentTypes: sampleContentTypes, entries: sampleEntries() };

it('has every type in the navigation, after Home, then content types and people for an owner', async () => {
  renderApp('/content/agents', signedIn);
  expect(await screen.findByRole('heading', { level: 1, name: 'Agents' })).toBeTruthy();
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Home', 'Agents', 'Listings', 'Media', 'Content types', 'People', 'Manage plugins']);
  expect(within(nav).getByRole('link', { name: 'Agents' }).getAttribute('aria-current')).toBe('page');
});

it('lists a type\'s entries, newest first, with a title, a state and when each was updated', async () => {
  renderApp('/content/listings', signedIn);
  const table = await screen.findByRole('grid', { name: 'Listings' });
  const rows = within(table).getAllByRole('row').slice(1).map((row) => Array.from(row.children, (cell) => cell.textContent));
  expect(rows).toEqual([
    ['6214 Lakeshore Drive/listings/6214-lakeshore-drive/', 'Published', '2 hours ago'],
    ['18 Alder Court/listings/18-alder-court/', 'Draft', 'yesterday'],
    ['907 Mesa Verde Lane/listings/907-mesa-verde-lane/', 'Unpublished changes', '3 days ago'],
    ['Untitled/listings/e4/', 'Draft', '8 days ago'],
  ]);
  expect(screen.getByText('4 entries')).toBeTruthy();
});

it('shows the picture and the columns a type asks for, each as its field reads in a list', async () => {
  const [listings, ...others] = sampleContentTypes;
  if (!listings) throw new Error('No sample types.');
  const described = {
    ...listings,
    fields: [...listings.fields, { id: 'f-cover', key: 'cover', type: 'image', label: { en: 'Cover' }, required: false, translated: false, options: {} }],
    list: { imagePath: ['f-cover'], fieldPaths: [['f-price'], ['f-address', 'f-city']] },
  };
  const [first, ...rest] = sampleEntries();
  if (!first) throw new Error('No sample entries.');
  renderApp('/content/listings', {
    ...signedIn,
    contentTypes: [described, ...others],
    entries: [{ ...first, data: { ...first.data, 'f-cover': 'porch' } }, ...rest],
    images: [{ name: 'porch', url: '/images/porch.jpg' }],
  });
  const table = await screen.findByRole('grid', { name: 'Listings' });
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Title', 'Price', 'City', 'Status', 'Updated']);
  const [row] = within(table).getAllByRole('row').slice(1);
  if (!row) throw new Error('No rows.');
  expect(Array.from(row.children, (cell) => cell.textContent).slice(1, 3)).toEqual(['500,000', 'Austin']);
  await waitFor(() => expect(row.querySelector('img')?.getAttribute('src')).toBe('/images/porch.jpg'));
  // The other rows keep an empty frame, so the names line up.
  expect(table.querySelectorAll('img')).toHaveLength(1);
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
  expect(rows[0]?.children[0]?.textContent).toBe('6214 Lakeshore Drive/listings/6214-lakeshore-drive/');
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
  expect(titles()).toEqual(['18 Alder Court/listings/18-alder-court/', 'Untitled/listings/e4/']);

  await user.type(screen.getByRole('searchbox', { name: 'Search listings' }), 'alder');
  expect(titles()).toEqual(['18 Alder Court/listings/18-alder-court/']);

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
  // Said on the sign-in screen, and not mistaken for a session that ran out.
  expect(await screen.findByRole('alertdialog', { name: 'Signed out' })).toBeTruthy();
  expect(screen.queryByText('You were signed out')).toBeNull();
});

it('says so when signing out fails, and stays signed in', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings', signedIn);
  await user.click(await screen.findByRole('button', { name: /^Account\s*Dana/ }));
  client.failNextWith = 'The server could not be reached.';
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
  const message = await screen.findByRole('alertdialog', { name: 'Not signed out' });
  expect(message.textContent).toContain('The server could not be reached.');
  expect(screen.getByRole('button', { name: /^Account\s*Dana/ })).toBeTruthy();
});

it('shows labels in the language asked for', async () => {
  render(<AdminApp client={new MemoryAdminClient(signedIn)} siteName="Lakeshore" locale="es-ES" initialPath="/content/listings" />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Propiedades' })).toBeTruthy();
  expect(await screen.findByText('hace 2 horas')).toBeTruthy();
});

it('keeps the shape of the screen while the entries are on the way, and says so to screen readers', async () => {
  renderApp('/content/listings', { ...signedIn, delay: 150 });
  expect((await screen.findByRole('status')).textContent).toBe('Loading');
  expect(await screen.findByRole('grid', { name: 'Listings' })).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
});
