import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleUser } from '../../testing/sample-content.js';

const signedIn = { user: sampleUser, contentTypes: sampleContentTypes };

it('lists every content type with its key, how many fields it has and where its pages live', async () => {
  renderApp('/types', signedIn);
  const table = within(await screen.findByRole('grid', { name: 'Content types' }));
  const listings = within(table.getByRole('row', { name: /Listings/ }));
  expect(listings.getByText('listings')).toBeTruthy();
  expect(listings.getByText('9 fields')).toBeTruthy();
  expect(listings.getByText('/listings/[slug]')).toBeTruthy();
  expect(within(table.getByRole('row', { name: /Agents/ })).getByText('1 field')).toBeTruthy();
});

it('is reached from the sidebar by an owner, and not offered to anyone else', async () => {
  const user = userEvent.setup();
  const { unmount } = renderApp('/', signedIn);
  // With the content: the rail's Content, then its column.
  await user.click(await screen.findByRole('link', { name: 'Content' }));
  await user.click(await screen.findByRole('link', { name: 'Content types' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Content types' })).toBeTruthy();
  unmount();
  renderApp('/', { ...signedIn, user: { ...sampleUser, role: 'editor' } });
  await user.click(await screen.findByRole('link', { name: 'Content' }));
  await screen.findByRole('link', { name: 'Listings' });
  expect(screen.queryByRole('link', { name: 'Content types' })).toBeNull();
});

it('starts a content type with a key made from its name, and opens it to add fields', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types', signedIn);
  await user.click(await screen.findByRole('button', { name: 'New content type' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'New content type' }));
  await user.type(dialog.getByRole('textbox', { name: /^Name/ }), 'Case studies');
  expect((dialog.getByRole('textbox', { name: /^Key/ }) as HTMLInputElement).value).toBe('case-studies');
  await user.type(dialog.getByRole('textbox', { name: /^Address of its pages/ }), '/work/[[slug]');
  await user.click(dialog.getByRole('button', { name: 'Create content type' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Case studies' })).toBeTruthy();
  expect(await screen.findByRole('alertdialog', { name: 'Case studies was created' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'No fields yet' })).toBeTruthy();
  // It is in the sidebar at once, with the other kinds of content.
  expect(screen.getByRole('link', { name: 'Case studies' })).toBeTruthy();
  expect((await client.listContentTypes()).find((type) => type.key === 'case-studies')).toMatchObject({ label: { en: 'Case studies' }, urlPattern: '/work/[slug]', fields: [] });
});

it('says what is missing, and what the server refused, on the field it is about', async () => {
  const user = userEvent.setup();
  renderApp('/types', signedIn);
  await user.click(await screen.findByRole('button', { name: 'New content type' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'New content type' }));
  await user.click(dialog.getByRole('button', { name: 'Create content type' }));
  expect(dialog.getByText('Give the content type a name.')).toBeTruthy();

  await user.type(dialog.getByRole('textbox', { name: /^Name/ }), 'Listings');
  await user.click(dialog.getByRole('button', { name: 'Create content type' }));
  expect(await dialog.findByText('There is already a content type with the key "listings". Choose another key.')).toBeTruthy();
  // What was typed is still there to correct.
  expect((dialog.getByRole('textbox', { name: /^Name/ }) as HTMLInputElement).value).toBe('Listings');
});

it('starts a single page, which is opened straight from the sidebar and has one entry', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types', signedIn);
  await user.click(await screen.findByRole('button', { name: 'New content type' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'New content type' }));
  await user.click(dialog.getByRole('radio', { name: 'One page' }));
  await user.type(dialog.getByRole('textbox', { name: /^Name/ }), 'About');
  await user.type(dialog.getByRole('textbox', { name: /^Address of the page/ }), '/about');
  await user.click(dialog.getByRole('button', { name: 'Create content type' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'About' })).toBeTruthy();

  await user.click((await screen.findAllByRole('button', { name: 'Add field' }))[0] as HTMLElement);
  const field = within(await screen.findByRole('dialog', { name: 'Add a field' }));
  await user.type(field.getByRole('textbox', { name: /^Name/ }), 'Story');
  await user.click(field.getByRole('button', { name: 'Add field' }));
  await screen.findByRole('row', { name: /^Story/ });

  // No list in between: the sidebar leads to the page itself, which nobody has to name.
  await user.click(screen.getByRole('link', { name: 'About' }));
  await user.type(await screen.findByRole('textbox', { name: /^Story/ }), 'Founded in 1998.');
  expect(screen.queryByRole('textbox', { name: /Identifier|Address/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByRole('alertdialog', { name: 'Draft saved' })).toBeTruthy();

  const about = (await client.listContentTypes()).find((type) => type.key === 'about');
  expect(about).toMatchObject({ kind: 'single', urlPattern: '/about' });
  expect((await client.listEntries({ type: 'about' })).items.map((entry) => entry.slug)).toEqual(['about']);

  // Coming back opens that same entry, not a second one.
  await user.click(screen.getByRole('link', { name: 'Home' }));
  await user.click(await screen.findByRole('link', { name: 'Content' }));
  await user.click(await screen.findByRole('link', { name: 'About' }));
  expect(((await screen.findByRole('textbox', { name: /^Story/ })) as HTMLTextAreaElement).value).toBe('Founded in 1998.');
  expect(screen.queryByRole('button', { name: 'About' })).toBeNull();
});
