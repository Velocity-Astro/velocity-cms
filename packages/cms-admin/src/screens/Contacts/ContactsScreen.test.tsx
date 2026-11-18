import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity/cms-ui';
import { afterEach, expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleForms, sampleSubmissions, sampleUser } from '../../testing/sample-content.js';

const signedIn = (role: 'owner' | 'editor' | 'author' = 'owner') => ({ user: { ...sampleUser, role }, contentTypes: sampleContentTypes, forms: sampleForms, submissions: sampleSubmissions });

afterEach(() => act(() => dismissToasts()));

it('is reached from the sidebar by an owner or an editor, and closed to an author', async () => {
  const user = userEvent.setup();
  const { unmount } = renderApp('/', signedIn('editor'));
  await user.click(await screen.findByRole('link', { name: 'Contacts' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Contacts' })).toBeTruthy();
  unmount();
  renderApp('/contacts', signedIn('author'));
  expect(await screen.findByText('Contacts are for owners and editors.')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Contacts' })).toBeNull();
  expect(screen.queryByRole('grid')).toBeNull();
});

it('lists everyone who wrote in, with where each first came from, and leaves out what was kept as spam', async () => {
  renderApp('/contacts', signedIn());
  const table = within(await screen.findByRole('grid', { name: 'Contacts' }));
  const ana = within(table.getByRole('row', { name: /Ana Ruiz/ }));
  expect(ana.getByText('ana@example.com')).toBeTruthy();
  expect(await ana.findByText('Contact us form on /contact/')).toBeTruthy();
  expect(table.getByRole('row', { name: /Tom Okafor/ })).toBeTruthy();
  expect(table.queryByRole('row', { name: /Cheap Loans/ })).toBeNull();
  expect(screen.getByText('2 contacts')).toBeTruthy();
});

it('finds a contact by what is typed, and says so when nobody matches', async () => {
  const user = userEvent.setup();
  renderApp('/contacts', signedIn());
  await screen.findByRole('row', { name: /Ana Ruiz/ });
  await user.type(screen.getByRole('searchbox', { name: 'Search contacts' }), 'okafor');
  await waitFor(() => expect(screen.queryByRole('row', { name: /Ana Ruiz/ })).toBeNull());
  expect(screen.getByRole('row', { name: /Tom Okafor/ })).toBeTruthy();
  await user.type(screen.getByRole('searchbox', { name: 'Search contacts' }), 'zz');
  expect(await screen.findByRole('heading', { level: 2, name: 'Nobody matches' })).toBeTruthy();
});

it('says so when there are no contacts, and adds one by hand with each problem on its field', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/contacts', { user: sampleUser, contentTypes: sampleContentTypes });
  expect(await screen.findByRole('heading', { level: 2, name: 'No contacts yet' })).toBeTruthy();
  await user.click(screen.getAllByRole('button', { name: 'New contact' })[0] as HTMLElement);
  const dialog = within(await screen.findByRole('dialog', { name: 'New contact' }));
  await user.click(dialog.getByRole('button', { name: 'Add contact' }));
  expect(await dialog.findByText('Give the contact an email address.')).toBeTruthy();
  await user.type(dialog.getByRole('textbox', { name: /^Name/ }), 'Li Wei');
  await user.type(dialog.getByRole('textbox', { name: /^Email/ }), 'li@example.com');
  await user.type(dialog.getByRole('textbox', { name: /^Phone/ }), 'call me');
  await user.click(dialog.getByRole('button', { name: 'Add contact' }));
  expect(await dialog.findByText('Enter a phone number, such as 512 555 0142.')).toBeTruthy();
  // What was typed is still there.
  expect((dialog.getByRole('textbox', { name: /^Name/ }) as HTMLInputElement).value).toBe('Li Wei');
  await user.clear(dialog.getByRole('textbox', { name: /^Phone/ }));
  await user.type(dialog.getByRole('textbox', { name: /^Phone/ }), '512 555 0199');
  await user.click(dialog.getByRole('button', { name: 'Add contact' }));
  expect(await screen.findByText('Li Wei added')).toBeTruthy();
  expect(await screen.findByRole('heading', { level: 1, name: 'Li Wei' })).toBeTruthy();
  expect((await client.listContacts()).items).toMatchObject([{ email: 'li@example.com', name: 'Li Wei', phone: '512 555 0199' }]);
});
