import { act, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity-astro/cms-ui';
import { afterEach, expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleEntries, sampleUser } from '../../testing/sample-content.js';

const signedIn = (role: 'owner' | 'editor' | 'author' = 'owner') => ({ user: { ...sampleUser, role }, contentTypes: sampleContentTypes, entries: sampleEntries() });

afterEach(() => act(() => dismissToasts()));

it('says so when the trash is empty', async () => {
  renderApp('/trash', signedIn());
  expect(await screen.findByRole('heading', { level: 2, name: 'The trash is empty' })).toBeTruthy();
});

it('lists what is in the trash with its kind, and restores an entry as a draft, open to carry on with', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/', signedIn());
  await client.trashEntry('e1');
  // The trash is kept with the content: the rail's Content, then its column.
  await user.click(await screen.findByRole('link', { name: 'Content' }));
  await user.click(await screen.findByRole('link', { name: 'Trash' }));
  const table = within(await screen.findByRole('grid', { name: 'Trash' }));
  const row = within(table.getByRole('row', { name: /6214 Lakeshore Drive/ }));
  expect(row.getByText('Listings')).toBeTruthy();
  expect(row.getByText('6214-lakeshore-drive · English')).toBeTruthy();

  await user.click(row.getByRole('button', { name: 'Restore 6214 Lakeshore Drive' }));
  expect(await screen.findByText('6214 Lakeshore Drive restored')).toBeTruthy();
  expect(await screen.findByRole('heading', { level: 1, name: '6214 Lakeshore Drive' })).toBeTruthy();
  expect(await client.getEntry('e1')).toMatchObject({ status: 'draft' });
  expect((await client.listTrash()).total).toBe(0);
});

it('deletes for good only after asking', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/', signedIn('editor'));
  await client.trashEntry('e1');
  // The trash is kept with the content: the rail's Content, then its column.
  await user.click(await screen.findByRole('link', { name: 'Content' }));
  await user.click(await screen.findByRole('link', { name: 'Trash' }));
  await user.click(await screen.findByRole('button', { name: 'Delete 6214 Lakeshore Drive for good' }));
  const dialog = within(await screen.findByRole('alertdialog', { name: 'Delete 6214 Lakeshore Drive for good?' }));
  expect(dialog.getByText(/cannot be brought back/)).toBeTruthy();
  await user.click(dialog.getByRole('button', { name: 'Cancel' }));
  expect((await client.listTrash()).total).toBe(1);

  await user.click(screen.getByRole('button', { name: 'Delete 6214 Lakeshore Drive for good' }));
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete for good' }));
  expect(await screen.findByText('6214 Lakeshore Drive deleted for good')).toBeTruthy();
  expect(await screen.findByRole('heading', { level: 2, name: 'The trash is empty' })).toBeTruthy();
  await expect(client.getEntry('e1')).rejects.toMatchObject({ code: 'not_found' });
});

it('lets an author restore, but not delete for good', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/', signedIn('author'));
  await client.trashEntry('e2');
  // The trash is kept with the content: the rail's Content, then its column.
  await user.click(await screen.findByRole('link', { name: 'Content' }));
  await user.click(await screen.findByRole('link', { name: 'Trash' }));
  expect(await screen.findByRole('button', { name: /^Restore / })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /for good$/ })).toBeNull();
});

it('says why when an entry cannot be restored, and keeps it in the trash', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/', signedIn());
  const gone = await client.trashEntry('e2');
  await client.createEntry({ type: 'listings', slug: gone.slug, data: {} });
  // The trash is kept with the content: the rail's Content, then its column.
  await user.click(await screen.findByRole('link', { name: 'Content' }));
  await user.click(await screen.findByRole('link', { name: 'Trash' }));
  await user.click(await screen.findByRole('button', { name: /^Restore / }));
  expect(await screen.findByText('Not restored')).toBeTruthy();
  expect(screen.getByText(/Another entry uses the slug/)).toBeTruthy();
  expect((await client.listTrash()).total).toBe(1);
});
