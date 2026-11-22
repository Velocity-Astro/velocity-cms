import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleUser } from '../../testing/sample-content.js';
import { tinyPng } from '@velocity-astro/cms-core/in-memory';

const images = [
  { name: 'kitchen', url: '/images/kitchen.jpg', width: 1200, height: 800 },
  { name: 'porch', url: '/images/porch.jpg' },
];
const signedIn = { user: sampleUser, contentTypes: sampleContentTypes, images };
const png = (name: string) => new File([tinyPng(1600, 900)], name, { type: 'image/png' });

it('is reached from the sidebar and shows every image, narrowed down by typing', async () => {
  const user = userEvent.setup();
  renderApp('/', signedIn);
  await user.click(await screen.findByRole('link', { name: 'Media' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Media' })).toBeTruthy();
  const grid = within(await screen.findByRole('grid', { name: 'Images' }));
  expect(grid.getAllByRole('row').map((row) => row.textContent)).toEqual(['kitchenComes with the site', 'porchComes with the site']);
  await user.type(screen.getByRole('searchbox', { name: 'Search images' }), 'por');
  expect(grid.getAllByRole('row')).toHaveLength(1);
  await user.type(screen.getByRole('searchbox', { name: 'Search images' }), 'xyz');
  expect(screen.getByText(/No images match/)).toBeTruthy();
});

it('takes an upload, shows what it is, and removes it after asking', async () => {
  const user = userEvent.setup();
  const { client, container } = renderApp('/media', signedIn);
  await screen.findByRole('grid', { name: 'Images' });
  await user.upload(container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement, png('Front Porch.png'));
  expect(await screen.findByRole('alertdialog', { name: 'front-porch was uploaded' })).toBeTruthy();

  // The new image is first, and marked.
  const grid = within(screen.getByRole('grid', { name: 'Images' }));
  expect(grid.getAllByRole('row')[0]?.textContent).toContain('Just uploaded');
  await user.click(await screen.findByRole('row', { name: 'front-porch, Just uploaded' }));
  const details = within(await screen.findByRole('dialog', { name: 'front-porch' }));
  expect(details.getByText('1600 × 900')).toBeTruthy();
  await user.click(details.getByRole('button', { name: 'Remove image' }));
  const ask = within(await screen.findByRole('alertdialog', { name: 'Remove front-porch?' }));
  expect(ask.getByText(/deleted for good/)).toBeTruthy();
  await user.click(ask.getByRole('button', { name: 'Remove image' }));

  expect(await screen.findByRole('alertdialog', { name: 'front-porch was removed' })).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('row', { name: /^front-porch/ })).toBeNull());
  expect(screen.queryByRole('dialog', { name: 'front-porch' })).toBeNull();
  expect((await client.listImages()).items.map((image) => image.name)).toEqual(['kitchen', 'porch']);
});

it('offers no way to remove an image the site came with, or to anyone who may not publish', async () => {
  const user = userEvent.setup();
  const { unmount } = renderApp('/media', signedIn);
  await user.click(await screen.findByRole('row', { name: 'kitchen' }));
  const details = within(await screen.findByRole('dialog', { name: 'kitchen' }));
  expect(details.getByText(/can't be removed here/)).toBeTruthy();
  expect(details.queryByRole('button', { name: 'Remove image' })).toBeNull();
  unmount();

  const author = renderApp('/media', { ...signedIn, user: { ...sampleUser, role: 'author' } });
  await screen.findByRole('grid', { name: 'Images' });
  await user.upload(author.container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement, png('garden.png'));
  await user.click(await screen.findByRole('row', { name: 'garden, Just uploaded' }));
  expect(within(await screen.findByRole('dialog', { name: 'garden' })).queryByRole('button', { name: 'Remove image' })).toBeNull();
});

it('says so when the site has no images and takes no uploads', async () => {
  renderApp('/media', { user: sampleUser, contentTypes: sampleContentTypes, images: [], uploads: false });
  expect(await screen.findByRole('heading', { name: 'No images yet' })).toBeTruthy();
  expect(screen.getByText(/nowhere to keep uploads/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Upload an image' })).toBeNull();
});

it('sorts newest first, filters by where an image is from, and shows a new upload whatever it was narrowed to', async () => {
  const user = userEvent.setup();
  const { container } = renderApp('/media', signedIn);
  const grid = within(await screen.findByRole('grid', { name: 'Images' }));
  await user.upload(container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement, png('deck.png'));
  await screen.findByRole('row', { name: 'deck, Just uploaded' });
  expect(grid.getAllByRole('row').map((row) => row.getAttribute('aria-label') ?? row.textContent)).toHaveLength(3);

  await user.click(screen.getByRole('button', { name: /All images/ }));
  await user.click(await screen.findByRole('option', { name: 'Came with the site' }));
  expect(grid.getAllByRole('row')).toHaveLength(2);
  expect(screen.getByText('Showing 2 of 3')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /Newest first/ }));
  await user.click(await screen.findByRole('option', { name: 'Name, A to Z' }));
  expect(grid.getAllByRole('row').map((row) => row.textContent?.replace('Comes with the site', ''))).toEqual(['kitchen', 'porch']);

  await user.upload(container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement, png('lawn.png'));
  expect(await screen.findByRole('row', { name: 'lawn, Just uploaded' })).toBeTruthy();
  expect(grid.getAllByRole('row')[0]?.textContent).toContain('lawn');
  expect(screen.queryByText(/^Showing/)).toBeNull();
});
