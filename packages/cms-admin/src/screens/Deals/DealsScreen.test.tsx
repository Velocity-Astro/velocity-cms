import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity-astro/cms-ui';
import { afterEach, expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleEntries, sampleForms, sampleSubmissions, sampleUser } from '../../testing/sample-content.js';

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

it('adds a field of the site\'s own to deals, and fills it in on a new deal', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/deals', signedIn());
  await user.click(await screen.findByRole('button', { name: 'Custom fields' }));
  const fields = within(await screen.findByRole('dialog', { name: 'Custom fields for deals' }));
  await user.click(await fields.findByRole('button', { name: 'Add field' }));
  const adding = within(await screen.findByRole('dialog', { name: 'Add a field' }));
  await user.type(adding.getByRole('textbox', { name: /^Label/ }), 'Product');
  await user.click(adding.getByRole('button', { name: 'Add field' }));
  expect(await fields.findByRole('row', { name: /Product/ })).toBeTruthy();
  const [product] = (await client.getCustomFields()).deal;
  const { items } = await client.listContacts({});
  const deal = await client.createDeal({ contactId: items[0]?.id ?? '', title: 'Sale on Alder', value: 100, data: { [product?.id ?? '']: 'Listing' } });
  expect(deal.data).toEqual({ [product?.id ?? '']: 'Listing' });
});

it('says which listing a deal is about, shows it on the board and lists the deal on the listing', async () => {
  const user = userEvent.setup();
  const types = sampleContentTypes.map((type) => (type.key === 'listings' ? { ...type, forDeals: true as const } : type));
  const { client } = renderApp('/contacts', { ...signedIn(), contentTypes: types, entries: sampleEntries() });
  await user.click(await screen.findByRole('row', { name: /Ana Ruiz/ }));
  const card = within(await screen.findByRole('region', { name: 'Deals' }));
  await user.click(await card.findByRole('button', { name: 'Add deal' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'New deal' }));
  await user.click(await dialog.findByRole('button', { name: /On the site, it is about/ }));
  await user.click(await screen.findByRole('option', { name: 'Listings' }));
  await user.click(await dialog.findByRole('button', { name: /Which of Listings/ }));
  await user.click(await screen.findByRole('option', { name: '18 Alder Court' }));
  // A deal with no words of its own yet takes the listing's.
  expect((dialog.getByRole('textbox', { name: /^What it is about/ }) as HTMLInputElement).value).toBe('18 Alder Court');
  await user.type(dialog.getByRole('textbox', { name: /^What it is about/ }), ', to Ana');
  await user.type(dialog.getByRole('textbox', { name: /^Worth, in USD/ }), '450000');
  await user.click(dialog.getByRole('button', { name: 'Add deal' }));
  expect(await screen.findByText('18 Alder Court, to Ana added')).toBeTruthy();
  expect((await client.listDeals()).items[0]?.about).toEqual({ typeId: 'type-listings', entry: 'e2' });

  await user.click(screen.getByRole('link', { name: 'Deals' }));
  const board = within(await screen.findByRole('region', { name: 'New' }));
  expect(await board.findByText('18 Alder Court')).toBeTruthy();

  await user.click(screen.getByRole('link', { name: 'Content' }));
  await user.click(await screen.findByRole('link', { name: 'Listings' }));
  await user.dblClick(await screen.findByRole('row', { name: /18 Alder Court/ }));
  const deals = within(await screen.findByRole('region', { name: 'Deals about this' }));
  expect(await deals.findByRole('row', { name: /18 Alder Court, to Ana/ })).toBeTruthy();
  expect(deals.getByText('$450,000')).toBeTruthy();
});

it('offers nothing about the site while no content type takes deals', async () => {
  const user = userEvent.setup();
  renderApp('/contacts', { ...signedIn(), entries: sampleEntries() });
  await user.click(await screen.findByRole('row', { name: /Ana Ruiz/ }));
  await user.click(await within(await screen.findByRole('region', { name: 'Deals' })).findByRole('button', { name: 'Add deal' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'New deal' }));
  expect(dialog.queryByRole('button', { name: /On the site, it is about/ })).toBeNull();
});

it('shows how close this month is to the monthly target, counting only what was won this month', async () => {
  const user = userEvent.setup();
  // Begun where nothing asks for the pipeline, so the deals screen reads it as it is after this.
  const { client } = renderApp('/trash', signedIn());
  await screen.findByRole('heading', { level: 1, name: 'Trash' });
  const [ana] = (await client.listContacts({ search: 'ana' })).items;
  if (!ana) throw new Error('No contact for Ana');
  const pipeline = await client.getPipeline();
  await client.savePipeline({ stages: pipeline.stages, monthlyTarget: 20000, expectedRevision: pipeline.revision });
  await client.createDeal({ contactId: ana.id, title: 'Rental on Mesa Verde', value: 5000, stage: 'won' });
  await client.createDeal({ contactId: ana.id, title: 'Sale of 18 Alder Court', value: 400000, stage: 'qualified' });
  await user.click(screen.getByRole('link', { name: 'Deals' }));
  const month = new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date());
  const meter = await screen.findByRole('meter', { name: `${month} target` });
  expect(meter.getAttribute('aria-valuetext')).toBe('$5,000 of $20,000 · 25%');
});

it('shows no target when the pipeline has none', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/contacts', signedIn());
  await screen.findByRole('row', { name: /Ana Ruiz/ });
  const [ana] = (await client.listContacts({ search: 'ana' })).items;
  if (!ana) throw new Error('No contact for Ana');
  await client.createDeal({ contactId: ana.id, title: 'Rental on Mesa Verde', value: 5000, stage: 'won' });
  await user.click(screen.getByRole('link', { name: 'Deals' }));
  expect(await screen.findByText('Forecast')).toBeTruthy();
  expect(screen.queryByRole('meter')).toBeNull();
});
