import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity/cms-ui';
import { afterEach, expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleForms, sampleSubmissions, sampleUser } from '../../testing/sample-content.js';

const signedIn = (role: 'owner' | 'editor' | 'author' = 'owner') => ({ user: { ...sampleUser, role }, contentTypes: sampleContentTypes, forms: sampleForms, submissions: sampleSubmissions });

afterEach(() => act(() => dismissToasts()));

it('adds a deal from a contact, with each problem on its field, and lists it there', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/contacts', signedIn());
  await user.click(await screen.findByRole('row', { name: /Ana Ruiz/ }));
  const card = within(await screen.findByRole('region', { name: 'Deals' }));
  expect(await card.findByText('No deals with this contact yet.')).toBeTruthy();
  await user.click(card.getByRole('button', { name: 'Add deal' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'New deal' }));
  await user.click(dialog.getByRole('button', { name: 'Add deal' }));
  expect(await dialog.findByText('Say what the deal is about.')).toBeTruthy();
  await user.type(dialog.getByRole('textbox', { name: /^What it is about/ }), 'Sale of 18 Alder Court');
  await user.type(dialog.getByRole('textbox', { name: /^Worth, in USD/ }), '450000');
  await user.click(dialog.getByRole('button', { name: 'Add deal' }));
  expect(await screen.findByText('Sale of 18 Alder Court added')).toBeTruthy();
  const row = within(await card.findByRole('row', { name: /Sale of 18 Alder Court/ }));
  expect(row.getByText('$450,000')).toBeTruthy();
  expect(row.getByText('New')).toBeTruthy();
  expect((await client.listDeals()).items[0]).toMatchObject({ title: 'Sale of 18 Alder Court', value: 450000, stage: 'new' });
});

it('shows every deal by stage with what is open, forecast and won, and moves one from its menu', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/contacts', signedIn());
  await screen.findByRole('row', { name: /Ana Ruiz/ });
  const [ana] = (await client.listContacts({ search: 'ana' })).items;
  if (!ana) throw new Error('No contact for Ana');
  await client.createDeal({ contactId: ana.id, title: 'Sale of 18 Alder Court', value: 400000, stage: 'qualified' });
  await client.createDeal({ contactId: ana.id, title: 'Rental on Mesa Verde', value: 20000 });
  await user.click(screen.getByRole('link', { name: 'Deals' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Deals' })).toBeTruthy();
  expect(within(await screen.findByRole('group', { name: 'Open' })).getByText('$420,000')).toBeTruthy();
  expect(within(screen.getByRole('group', { name: 'Forecast' })).getByText('$242,000')).toBeTruthy();
  const board = within(screen.getByRole('group', { name: 'Deals by stage' }));
  const qualified = within(board.getByRole('region', { name: 'Qualified' }));
  expect(qualified.getByText('$400,000', { selector: 'span:not([class*="rounded"])' })).toBeTruthy();
  expect(qualified.getByRole('button', { name: /^Sale of 18 Alder Court/ }).textContent).toContain('Ana Ruiz');
  await user.click(qualified.getByRole('button', { name: 'Move Sale of 18 Alder Court' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Won' }));
  expect(await screen.findByText('Sale of 18 Alder Court moved to Won')).toBeTruthy();
  await waitFor(() => expect(within(screen.getByRole('group', { name: 'Won' })).getByText('$400,000')).toBeTruthy());
  expect(within(screen.getByRole('group', { name: 'Forecast' })).getByText('$2,000')).toBeTruthy();
  expect(within(board.getByRole('region', { name: 'Won' })).getByRole('button', { name: /^Sale of 18 Alder Court/ })).toBeTruthy();
});

it('changes and deletes a deal from its card', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/contacts', signedIn());
  await screen.findByRole('row', { name: /Ana Ruiz/ });
  const [ana] = (await client.listContacts({ search: 'ana' })).items;
  if (!ana) throw new Error('No contact for Ana');
  await client.createDeal({ contactId: ana.id, title: 'Rental', value: 20000 });
  await user.click(screen.getByRole('link', { name: 'Deals' }));
  await user.click(await screen.findByRole('button', { name: /^Rental/ }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Edit Rental' }));
  await user.type(dialog.getByRole('textbox', { name: /^What it is about/ }), ' on Mesa Verde');
  await user.click(dialog.getByRole('button', { name: 'Save deal' }));
  expect(await screen.findByText('Rental on Mesa Verde saved')).toBeTruthy();
  await user.click(await screen.findByRole('button', { name: /^Rental on Mesa Verde/ }));
  await user.click(within(await screen.findByRole('dialog', { name: 'Edit Rental on Mesa Verde' })).getByRole('button', { name: 'Delete deal' }));
  expect(await screen.findByText('Rental on Mesa Verde deleted')).toBeTruthy();
  expect(await screen.findByRole('heading', { level: 2, name: 'No deals yet' })).toBeTruthy();
});

it('is closed to an author', async () => {
  renderApp('/deals', signedIn('author'));
  expect(await screen.findByText('Deals are for owners and editors.')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Deals' })).toBeNull();
});
