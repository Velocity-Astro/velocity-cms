import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity-astro/cms-ui';
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

it('shows where each contact stands, and narrows the list to a stage or to who looks after them', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/contacts', signedIn());
  const ana = within(await screen.findByRole('row', { name: /Ana Ruiz/ }));
  expect(await ana.findByText('New')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /Stage$/ }));
  await user.click(await screen.findByRole('option', { name: 'Contacted' }));
  expect(await screen.findByRole('heading', { level: 2, name: 'Nobody matches' })).toBeTruthy();
  const [first] = (await client.listContacts({ search: 'ana' })).items;
  if (!first) throw new Error('No contact for Ana');
  await client.updateContact(first.id, { stage: 'contacted', ownerId: 'u1', expectedRevision: first.revision });
  await user.click(screen.getByRole('button', { name: /Stage$/ }));
  await user.click(await screen.findByRole('option', { name: 'All stages' }));
  await user.click(screen.getByRole('button', { name: /Looked after by$/ }));
  await user.click(await screen.findByRole('option', { name: 'Me' }));
  await waitFor(() => expect(screen.queryByRole('row', { name: /Tom Okafor/ })).toBeNull());
  const mine = within(await screen.findByRole('row', { name: /Ana Ruiz/ }));
  expect(await mine.findByText('Contacted')).toBeTruthy();
  expect(await mine.findByText('Dana')).toBeTruthy();
  expect(screen.getByText('1 contact')).toBeTruthy();
});

it('shows the contacts on a board by stage, and moves one from its menu', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/contacts', signedIn());
  await screen.findByRole('row', { name: /Ana Ruiz/ });
  await user.click(screen.getByRole('radio', { name: 'Board' }));
  const board = within(await screen.findByRole('group', { name: 'Pipeline' }));
  expect(board.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['New', 'Contacted', 'Qualified', 'Won', 'Lost']);
  const fresh = within(board.getByRole('region', { name: 'New' }));
  expect(fresh.getAllByRole('listitem')).toHaveLength(2);
  expect(within(board.getByRole('region', { name: 'Won' })).getByText('Nobody here')).toBeTruthy();
  await user.click(fresh.getByRole('button', { name: 'Move Ana Ruiz' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Qualified' }));
  expect(await screen.findByText('Ana Ruiz moved to Qualified')).toBeTruthy();
  await waitFor(() => expect(within(board.getByRole('region', { name: 'Qualified' })).getByRole('button', { name: /^Ana Ruiz/ })).toBeTruthy());
  expect(within(board.getByRole('region', { name: 'New' })).getAllByRole('listitem')).toHaveLength(1);
  expect((await client.listContacts({ stage: 'qualified' })).total).toBe(1);
  // A card opens its contact.
  await user.click(within(board.getByRole('region', { name: 'Qualified' })).getByRole('button', { name: /^Ana Ruiz/ }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Ana Ruiz' })).toBeTruthy();
});

it('says what went wrong when a card cannot be moved, and leaves it where it was', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/contacts?view=board', signedIn());
  const board = within(await screen.findByRole('group', { name: 'Pipeline' }));
  const fresh = within(board.getByRole('region', { name: 'New' }));
  const [ana] = (await client.listContacts({ search: 'ana' })).items;
  if (!ana) throw new Error('No contact for Ana');
  // Someone else changed her since the board was drawn.
  await client.updateContact(ana.id, { name: 'Ana R.', expectedRevision: ana.revision });
  await user.click(fresh.getByRole('button', { name: 'Move Ana Ruiz' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Won' }));
  expect(await screen.findByText('The contact was not moved')).toBeTruthy();
  await waitFor(() => expect(within(board.getByRole('region', { name: 'New' })).getByRole('button', { name: /^Ana R\./ })).toBeTruthy());
  expect(within(board.getByRole('region', { name: 'Won' })).getByText('Nobody here')).toBeTruthy();
});

it('renames, adds and removes stages, with each problem on its row', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/contacts?view=board', signedIn());
  await screen.findByRole('group', { name: 'Pipeline' });
  await user.click(screen.getByRole('button', { name: 'Edit stages' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Stages' }));
  const names = () => dialog.getAllByRole('textbox', { name: /^Name/ }) as HTMLInputElement[];
  expect(names().map((name) => name.placeholder)).toEqual(['New', 'Contacted', 'Qualified', 'Won', 'Lost']);
  await user.type(names()[1] as HTMLElement, 'Called back');
  await user.click(dialog.getByRole('button', { name: 'Remove stage 3' }));
  await user.click(dialog.getByRole('button', { name: 'Add stage' }));
  await user.click(dialog.getByRole('button', { name: 'Save stages' }));
  expect(await dialog.findByText('Give the stage a name.')).toBeTruthy();
  expect(names()[1]?.value).toBe('Called back');
  await user.type(names()[4] as HTMLElement, 'Viewing booked');
  await user.click(dialog.getByRole('button', { name: 'Save stages' }));
  expect(await screen.findByText('Stages saved')).toBeTruthy();
  const board = within(screen.getByRole('group', { name: 'Pipeline' }));
  await waitFor(() => expect(board.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['New', 'Called back', 'Won', 'Lost', 'Viewing booked']));
  expect((await client.getPipeline()).revision).toBe(1);
});

it('sets each open stage\'s chance, the currency and who new contacts go to', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/contacts?view=board', signedIn());
  await screen.findByRole('group', { name: 'Pipeline' });
  await user.click(screen.getByRole('button', { name: 'Edit stages' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Stages' }));
  const chances = dialog.getAllByRole('textbox', { name: /^Chance/ }) as HTMLInputElement[];
  // Only the three open stages have a chance to set.
  expect(chances.map((chance) => chance.value)).toEqual(['10', '30', '60']);
  await user.clear(chances[0] as HTMLElement);
  await user.type(chances[0] as HTMLElement, '25');
  const currency = dialog.getByRole('textbox', { name: /^Currency/ });
  await user.clear(currency);
  await user.type(currency, 'euros');
  await user.click(dialog.getByRole('checkbox', { name: 'Dana' }));
  await user.click(dialog.getByRole('button', { name: 'Save stages' }));
  expect(await dialog.findByText('Give a currency by its three letters, such as USD.')).toBeTruthy();
  await user.clear(currency);
  await user.type(currency, 'eur');
  await user.click(dialog.getByRole('button', { name: 'Save stages' }));
  expect(await screen.findByText('Stages saved')).toBeTruthy();
  const saved = await client.getPipeline();
  expect(saved).toMatchObject({ currency: 'EUR', assignTo: ['u1'] });
  expect(saved.stages[0]).toMatchObject({ id: 'new', chance: 25 });
});

it('brings in a file of contacts: the columns are matched, and what came of each row is said', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/contacts', signedIn());
  await user.click(await screen.findByRole('button', { name: 'Import' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Import contacts' }));
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('No file input');

  // A file with headings and nothing under them is refused in words.
  await user.upload(input, new File(['Name,Email\n'], 'empty.csv', { type: 'text/csv' }));
  expect(await dialog.findByText(/has no rows under its headings/)).toBeTruthy();

  const file = 'Full name,E-mail address,Mobile,Notes\n"Haddad, Omar",omar@example.com,512 555 0142,met at the open house\nAna Again,ana@example.com,,\nNo Address,nowhere,,\n';
  await user.upload(input, new File([file], 'contacts.csv', { type: 'text/csv' }));
  expect(await dialog.findByText('3 rows found. Say what each column holds.')).toBeTruthy();
  // Each column is guessed from its heading, and one that is nothing known is left out.
  expect(dialog.getByRole('button', { name: /Column "Full name"/ }).textContent).toContain('Name');
  expect(dialog.getByRole('button', { name: /Column "E-mail address"/ }).textContent).toContain('Email');
  expect(dialog.getByRole('button', { name: /Column "Mobile"/ }).textContent).toContain('Phone');
  expect(dialog.getByRole('button', { name: /Column "Notes"/ }).textContent).toContain('Leave it out');
  expect(dialog.getByText('For example: Haddad, Omar')).toBeTruthy();

  await user.click(dialog.getByRole('button', { name: 'Import 3 rows' }));
  expect(await dialog.findByText('1 contact was added.')).toBeTruthy();
  expect(dialog.getByText('1 you already had were left as they are.')).toBeTruthy();
  expect(dialog.getByText('1 row was left out:')).toBeTruthy();
  expect(dialog.getByText('Row 4: email: Enter an email address, such as ana@example.com.')).toBeTruthy();
  expect((await client.listContacts({ search: 'omar@example.com' })).items[0]).toMatchObject({ name: 'Haddad, Omar', phone: '512 555 0142' });

  await user.click(dialog.getByRole('button', { name: 'Done' }));
  expect(await within(await screen.findByRole('grid', { name: 'Contacts' })).findByRole('row', { name: /Haddad, Omar/ })).toBeTruthy();
});
