import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity-astro/cms-ui';
import { afterEach, expect, it } from 'vitest';
import type { Person } from '../../client/admin-client.js';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleUser } from '../../testing/sample-content.js';

const ben: Person = { id: 'u2', email: 'ben@example.com', name: 'Ben', role: 'author' };
const site = (changes: object = {}) => ({ user: sampleUser, contentTypes: sampleContentTypes, people: [sampleUser, ben], ...changes });
const table = () => screen.findByRole('grid', { name: 'People' });
const names = async () => within(await table()).getAllByRole('rowheader').map((cell) => cell.textContent);

afterEach(() => act(() => dismissToasts()));

it('lists everyone who can sign in, and marks which one you are', async () => {
  const user = userEvent.setup();
  renderApp('/', site());
  await user.click(await screen.findByRole('link', { name: 'People' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'People' })).toBeTruthy();
  expect(await names()).toEqual(['Benben@example.com', 'DanaYoudana@example.com']);
  // Your own role and your own removal are not offered: either could lock you out.
  expect(screen.getByRole('button', { name: /Role of Dana/ })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Remove Dana' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: /Role of Ben/ }).textContent).toContain('Author');
});

it('invites someone, showing what the server says about each field', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/people', site());
  await user.click(await screen.findByRole('button', { name: 'Invite someone' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Invite someone' }));
  await user.click(dialog.getByRole('button', { name: 'Send invitation' }));
  expect(await dialog.findByText('Enter an email address, such as name@example.com.')).toBeTruthy();
  expect(dialog.getByText("Enter the person's name.")).toBeTruthy();

  await user.type(dialog.getByRole('textbox', { name: /^Name/ }), 'Maya');
  await user.type(dialog.getByRole('textbox', { name: /^Email/ }), 'ben@example.com');
  await user.click(dialog.getByRole('button', { name: 'Send invitation' }));
  expect(await dialog.findByText('ben@example.com can already sign in.')).toBeTruthy();

  await user.clear(dialog.getByRole('textbox', { name: /^Email/ }));
  await user.type(dialog.getByRole('textbox', { name: /^Email/ }), 'maya@example.com');
  await user.click(dialog.getByRole('button', { name: 'Send invitation' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Invite someone' })).toBeNull());
  expect(await screen.findByText('Maya was invited')).toBeTruthy();
  // Until Maya uses a sign-in link she is marked as invited. Dana, who is signed in, is not.
  expect(await names()).toContain('MayaInvitedmaya@example.com · Has not signed in yet.');
  expect((await names()).filter((name) => name.includes('Invited'))).toHaveLength(1);
  expect((await client.listPeople()).find((person) => person.name === 'Maya')).toMatchObject({ email: 'maya@example.com', role: 'editor' });
});

it('changes what someone may do', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/people', site());
  await user.click(await screen.findByRole('button', { name: /Role of Ben/ }));
  await user.click(await screen.findByRole('option', { name: 'Editor' }));
  expect(await screen.findByText("Ben's role is now Editor")).toBeTruthy();
  expect((await client.listPeople()).find((person) => person.id === 'u2')?.role).toBe('editor');
});

it('removes someone after asking, and keeps them when the answer is no', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/people', site());
  await user.click(await screen.findByRole('button', { name: 'Remove Ben' }));
  const asking = within(await screen.findByRole('alertdialog', { name: 'Remove Ben?' }));
  await user.click(asking.getByRole('button', { name: 'Cancel' }));
  expect(await client.listPeople()).toHaveLength(2);

  await user.click(screen.getByRole('button', { name: 'Remove Ben' }));
  await user.click(within(await screen.findByRole('alertdialog', { name: 'Remove Ben?' })).getByRole('button', { name: 'Remove' }));
  expect(await screen.findByText('Ben was removed')).toBeTruthy();
  expect(await names()).toEqual(['DanaYoudana@example.com']);
});

it('shows no way to People to someone who is not an owner, and says why the screen is closed to them', async () => {
  const editor: Person = { ...sampleUser, role: 'editor' };
  renderApp('/people', site({ user: editor }));
  expect(await screen.findByText(/does not allow/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'People' })).toBeNull();
});

it('adds a passkey from the account menu, and says so when the browser makes none', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/', site());
  await user.click(await screen.findByRole('button', { name: /Account/ }));
  await user.click(await screen.findByRole('menuitem', { name: 'Passkeys' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Passkeys' }));
  expect(await dialog.findByText('You have no passkeys yet.')).toBeTruthy();
  const name = dialog.getByRole('textbox', { name: /Name for this passkey/ });
  await user.clear(name);
  await user.type(name, 'Work laptop');
  client.failNextWith = 'The passkey prompt was closed.';
  await user.click(dialog.getByRole('button', { name: 'Add passkey' }));
  expect(await dialog.findByText('No passkey was added. The passkey prompt was closed.')).toBeTruthy();
  await user.click(dialog.getByRole('button', { name: 'Add passkey' }));
  expect(await screen.findByText('Passkey added')).toBeTruthy();
  expect(client.passkeys).toEqual(['Work laptop']);

  // The new one is listed at once, and can be taken away again.
  await user.click(await dialog.findByRole('button', { name: 'Remove Work laptop' }));
  expect(await screen.findByText('Work laptop removed')).toBeTruthy();
  expect(await dialog.findByText('You have no passkeys yet.')).toBeTruthy();
  expect(client.passkeys).toEqual([]);
});
