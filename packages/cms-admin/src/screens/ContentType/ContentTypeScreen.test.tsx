import type { ContentTypeDef } from '@velocity/cms-core';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleEntries, sampleUser } from '../../testing/sample-content.js';

const signedIn = { user: sampleUser, contentTypes: sampleContentTypes, entries: sampleEntries() };
const agentsWithSections: ContentTypeDef = {
  id: 'type-agents',
  key: 'agents',
  kind: 'collection',
  label: { en: 'Agents' },
  fields: [
    { id: 'f-name', key: 'name', type: 'text', label: { en: 'Name' }, translated: true, required: true, options: {} },
    { id: 'f-bio', key: 'bio', type: 'text', label: { en: 'Bio' }, translated: true, required: false, options: { multiline: true } },
    { id: 'f-phone', key: 'phone', type: 'text', label: { en: 'Phone' }, translated: false, required: false, options: {} },
  ],
  sections: [
    { key: 'about', label: { en: 'About' }, fieldIds: ['f-name', 'f-bio'] },
    { key: 'contact', label: { en: 'Contact' }, fieldIds: ['f-phone'], aside: true },
  ],
};
const fieldNames = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('rowheader')[0]?.textContent);
const keysOf = async (client: { listContentTypes(): Promise<readonly ContentTypeDef[]> }, key: string) =>
  (await client.listContentTypes()).find((type) => type.key === key)?.fields.filter((field) => field.deletedAt === undefined).map((field) => field.key);

it('shows a type\'s fields with their kind and rules', async () => {
  renderApp('/types/listings', signedIn);
  expect(await screen.findByRole('heading', { level: 1, name: 'Listings' })).toBeTruthy();
  expect(screen.getByText('Key: listings · /listings/[slug]')).toBeTruthy();
  const table = within(screen.getByRole('grid', { name: 'Fields' }));
  const title = within(table.getByRole('row', { name: /^Title/ }));
  expect(title.getByText('Text')).toBeTruthy();
  expect(title.getByText('Required')).toBeTruthy();
  expect(within(table.getByRole('row', { name: /^Address/ })).getByText('Group')).toBeTruthy();
});

it('adds a field with a key made from its name, and the entry form has it at once', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/agents', signedIn);
  await user.click(await screen.findByRole('button', { name: 'Add field' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Add a field' }));
  await user.type(dialog.getByRole('textbox', { name: /^Name/ }), 'Years of experience');
  expect((dialog.getByRole('textbox', { name: /^Key/ }) as HTMLInputElement).value).toBe('yearsOfExperience');
  await user.click(dialog.getByRole('button', { name: /Kind of field/ }));
  await user.click(await screen.findByRole('option', { name: 'Number' }));
  await user.click(dialog.getByRole('checkbox', { name: 'Whole numbers only' }));
  await user.click(dialog.getByRole('checkbox', { name: 'Must be filled in before publishing' }));
  await user.click(dialog.getByRole('button', { name: 'Add field' }));

  expect(await screen.findByRole('alertdialog', { name: 'Years of experience was added' })).toBeTruthy();
  const row = within(await screen.findByRole('row', { name: /^Years of experience/ }));
  expect(row.getByText('Number')).toBeTruthy();
  expect(row.getByText('Required')).toBeTruthy();
  const saved = (await client.listContentTypes()).find((type) => type.key === 'agents')?.fields.at(-1);
  expect(saved).toMatchObject({ key: 'yearsOfExperience', type: 'number', label: { en: 'Years of experience' }, required: true, translated: true, options: { integer: true } });

  await user.click(screen.getByRole('link', { name: 'View entries' }));
  await user.click((await screen.findAllByRole('button', { name: 'New entry' }))[0] as HTMLElement);
  expect(await screen.findByRole('textbox', { name: /Years of experience/ })).toBeTruthy();
});

it('asks for what a kind needs before adding it: options for a choice, a type for a link', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/agents', signedIn);
  await user.click(await screen.findByRole('button', { name: 'Add field' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Add a field' }));
  await user.type(dialog.getByRole('textbox', { name: /^Name/ }), 'Office');
  await user.click(dialog.getByRole('button', { name: /Kind of field/ }));
  await user.click(await screen.findByRole('option', { name: 'Choice' }));
  await user.click(dialog.getByRole('button', { name: 'Add field' }));
  expect(dialog.getByText('Write at least one option.')).toBeTruthy();

  await user.type(dialog.getByRole('textbox', { name: /^Options/ }), 'Lakeside{Enter}{Enter}Downtown{Enter}Lakeside');
  await user.click(dialog.getByRole('button', { name: 'Add field' }));
  await waitFor(async () => expect(await keysOf(client, 'agents')).toEqual(['name', 'office']));
  expect((await client.listContentTypes()).find((type) => type.key === 'agents')?.fields[1]?.options).toEqual({ choices: ['Lakeside', 'Downtown'] });
});

it('refuses a key that is taken, on the key, and keeps what was typed', async () => {
  const user = userEvent.setup();
  renderApp('/types/agents', signedIn);
  await user.click(await screen.findByRole('button', { name: 'Add field' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Add a field' }));
  await user.type(dialog.getByRole('textbox', { name: /^Name/ }), 'Name');
  await user.click(dialog.getByRole('button', { name: 'Add field' }));
  expect(await dialog.findByText('This content type already has a field with the key "name".')).toBeTruthy();
  expect(await screen.findByRole('alertdialog', { name: 'The field was not added' })).toBeTruthy();
  expect((dialog.getByRole('textbox', { name: /^Name/ }) as HTMLInputElement).value).toBe('Name');
});

it('changes a field in place: its name, key, help, rules and settings', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/listings', signedIn);
  await user.click(await screen.findByRole('button', { name: 'Edit Description' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Edit Description' }));
  expect(dialog.getByText('Kind: Text. A field keeps its kind, so its content stays readable.')).toBeTruthy();
  expect((dialog.getByRole('checkbox', { name: 'Several lines' }) as HTMLInputElement).checked).toBe(true);
  const name = dialog.getByRole('textbox', { name: /^Name/ });
  await user.clear(name);
  await user.type(name, 'Summary');
  await user.type(dialog.getByRole('textbox', { name: /^Help text/ }), 'Two or three sentences.');
  await user.click(dialog.getByRole('checkbox', { name: 'Each language has its own value' }));
  await user.click(dialog.getByRole('button', { name: 'Save field' }));

  expect(await screen.findByRole('alertdialog', { name: 'Summary was saved' })).toBeTruthy();
  expect(within(await screen.findByRole('row', { name: /^Summary/ })).getByText('Same in every language')).toBeTruthy();
  const saved = (await client.listContentTypes()).find((type) => type.key === 'listings')?.fields.find((field) => field.id === 'f-description');
  // The key stays unless it is changed on purpose: the site's pages read the field by it.
  expect(saved).toMatchObject({ key: 'description', label: { en: 'Summary' }, help: { en: 'Two or three sentences.' }, translated: false, options: { multiline: true } });
});

it('moves a field up and down among the fields it is shown with', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/listings', signedIn);
  const table = await screen.findByRole('grid', { name: 'Fields' });
  expect((screen.getByRole('button', { name: 'Move Title up' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Move Photos down' }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Move Price up' }));
  await waitFor(() => expect(fieldNames(table).slice(0, 3)).toEqual(['Title', 'Price', 'Description'].map((name) => expect.stringContaining(name))));
  expect((await keysOf(client, 'listings'))?.slice(0, 3)).toEqual(['title', 'price', 'description']);
});

it('removes a field after asking, keeps it to restore, and restores it', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/listings', signedIn);
  await user.click(await screen.findByRole('button', { name: 'Remove Virtual tour' }));
  const question = within(await screen.findByRole('alertdialog', { name: 'Remove Virtual tour?' }));
  expect(question.getByText(/Its content is kept/)).toBeTruthy();
  await user.click(question.getByRole('button', { name: 'Remove field' }));
  expect(await screen.findByRole('alertdialog', { name: 'Virtual tour was removed' })).toBeTruthy();
  expect(await keysOf(client, 'listings')).not.toContain('virtualTour');

  const removed = within(await screen.findByRole('grid', { name: 'Removed fields' }));
  await user.click(removed.getByRole('button', { name: 'Restore Virtual tour' }));
  expect(await screen.findByRole('alertdialog', { name: 'Virtual tour was restored' })).toBeTruthy();
  expect(await keysOf(client, 'listings')).toContain('virtualTour');
  expect(screen.queryByRole('grid', { name: 'Removed fields' })).toBeNull();
});

it('shows fields under the sections the editor has, adds to a section and moves a field between them', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/agents', { user: sampleUser, contentTypes: [agentsWithSections] });
  const about = await screen.findByRole('grid', { name: 'Fields in About' });
  expect(fieldNames(about)).toEqual([expect.stringContaining('Name'), expect.stringContaining('Bio')]);
  expect(fieldNames(screen.getByRole('grid', { name: 'Fields in Contact' }))).toEqual([expect.stringContaining('Phone')]);

  await user.click(screen.getByRole('button', { name: 'Edit Bio' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Edit Bio' }));
  await user.click(dialog.getByRole('button', { name: /Section/ }));
  await user.click(await screen.findByRole('option', { name: 'Contact' }));
  await user.click(dialog.getByRole('button', { name: 'Save field' }));
  await waitFor(async () =>
    expect((await client.listContentTypes())[0]?.sections?.map((section) => section.fieldIds)).toEqual([['f-name'], ['f-phone', 'f-bio']]),
  );

  await user.click(screen.getByRole('button', { name: 'Add field' }));
  const adding = within(await screen.findByRole('dialog', { name: 'Add a field' }));
  await user.type(adding.getByRole('textbox', { name: /^Name/ }), 'Motto');
  await user.click(adding.getByRole('button', { name: 'Add field' }));
  await waitFor(async () => expect((await client.listContentTypes())[0]?.sections?.[0]?.fieldIds).toHaveLength(2));
  expect(fieldNames(await screen.findByRole('grid', { name: 'Fields in About' }))).toEqual([expect.stringContaining('Name'), expect.stringContaining('Motto')]);
});

it('changes what a type is called and where its pages live', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/agents', signedIn);
  await user.click(await screen.findByRole('button', { name: 'Settings' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Settings for Agents' }));
  const name = dialog.getByRole('textbox', { name: /^Name/ });
  await user.clear(name);
  await user.type(name, 'Team');
  await user.clear(dialog.getByRole('textbox', { name: /^Address of its pages/ }));
  await user.click(dialog.getByRole('button', { name: 'Save settings' }));
  expect(await screen.findByRole('alertdialog', { name: 'Settings saved' })).toBeTruthy();
  expect(await screen.findByRole('heading', { level: 1, name: 'Team' })).toBeTruthy();
  expect(screen.getByText('Key: agents · No page of its own')).toBeTruthy();
  expect((await client.listContentTypes()).find((type) => type.key === 'agents')).toMatchObject({ label: { en: 'Team', es: 'Agentes' } });
});

it('says so when the address names no content type', async () => {
  renderApp('/types/nothing', signedIn);
  expect(await screen.findByRole('heading', { name: 'This content type does not exist' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'All content types' })).toBeTruthy();
});

const optionsOf = async (client: { listContentTypes(): Promise<readonly ContentTypeDef[]> }, typeKey: string, fieldKey: string) =>
  (await client.listContentTypes()).find((type) => type.key === typeKey)?.fields.find((field) => field.key === fieldKey)?.options as { fields: { key: string; deletedAt?: string }[] };

it('opens a group to add, change, move and remove the fields it holds', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/listings', signedIn);
  expect(within(await screen.findByRole('row', { name: /^Address/ })).getByText('address · Holds 2 fields')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Fields inside Address' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Address' })).toBeTruthy();
  expect(screen.getByText('The fields each Address of Listings is made of.')).toBeTruthy();
  const table = screen.getByRole('grid', { name: 'Fields' });
  expect(fieldNames(table)).toEqual([expect.stringContaining('Street'), expect.stringContaining('City')]);
  // A group has no sections or settings of its own.
  expect(screen.queryByRole('button', { name: 'Sections' })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Add field' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Add a field' }));
  await user.type(dialog.getByRole('textbox', { name: /^Name/ }), 'ZIP code');
  expect(dialog.queryByRole('button', { name: /Section/ })).toBeNull();
  await user.click(dialog.getByRole('button', { name: 'Add field' }));
  expect(await screen.findByRole('alertdialog', { name: 'ZIP code was added' })).toBeTruthy();

  await user.click(await screen.findByRole('button', { name: 'Move ZIP code up' }));
  await waitFor(async () => expect((await optionsOf(client, 'listings', 'address')).fields.map((field) => field.key)).toEqual(['street', 'zipCode', 'city']));

  await user.click(screen.getByRole('button', { name: 'Remove Street' }));
  await user.click(within(await screen.findByRole('alertdialog', { name: 'Remove Street?' })).getByRole('button', { name: 'Remove field' }));
  await user.click(await within(await screen.findByRole('grid', { name: 'Removed fields' })).findByRole('button', { name: 'Restore Street' }));
  await waitFor(async () => expect((await optionsOf(client, 'listings', 'address')).fields.every((field) => field.deletedAt === undefined)).toBe(true));

  await user.click(screen.getByRole('link', { name: 'Back to Listings' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Listings' })).toBeTruthy();
  expect(within(screen.getByRole('row', { name: /^Address/ })).getByText('address · Holds 3 fields')).toBeTruthy();
});

it('adds a group, and a list of groups, ready to be given fields', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/agents', signedIn);
  await user.click(await screen.findByRole('button', { name: 'Add field' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Add a field' }));
  await user.type(dialog.getByRole('textbox', { name: /^Name/ }), 'Offices');
  await user.click(dialog.getByRole('button', { name: /Kind of field/ }));
  await user.click(await screen.findByRole('option', { name: 'List' }));
  await user.click(dialog.getByRole('button', { name: /Each item is/ }));
  await user.click(await screen.findByRole('option', { name: 'Group' }));
  await user.click(dialog.getByRole('button', { name: 'Add field' }));

  await user.click(await screen.findByRole('button', { name: 'Fields inside Offices' }));
  expect(await screen.findByRole('heading', { name: 'No fields yet' })).toBeTruthy();
  await user.click(screen.getAllByRole('button', { name: 'Add field' })[0] as HTMLElement);
  const inner = within(await screen.findByRole('dialog', { name: 'Add a field' }));
  await user.type(inner.getByRole('textbox', { name: /^Name/ }), 'City');
  await user.click(inner.getByRole('button', { name: 'Add field' }));
  await waitFor(async () => {
    const offices = (await client.listContentTypes()).find((type) => type.key === 'agents')?.fields.find((field) => field.key === 'offices');
    expect(offices?.options).toMatchObject({ of: { type: 'group', options: { fields: [{ key: 'city', type: 'text' }] } } });
  });
});

it('says so when the address leads into a field that holds none', async () => {
  renderApp('/types/listings?in=f-title', signedIn);
  expect(await screen.findByRole('heading', { name: 'This content type does not exist' })).toBeTruthy();
});

it('names, adds, orders and removes sections, without removing a field', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/agents', { user: sampleUser, contentTypes: [agentsWithSections] });
  await user.click(await screen.findByRole('button', { name: 'Sections' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Sections' }));
  const first = dialog.getByRole('textbox', { name: 'Name of section 1' });
  await user.clear(first);
  await user.type(first, 'Profile');
  await user.click(dialog.getByRole('button', { name: 'Add section' }));
  await user.click(dialog.getByRole('button', { name: 'Save sections' }));
  expect(dialog.getByText('Give every section a name.')).toBeTruthy();

  await user.type(dialog.getByRole('textbox', { name: 'Name of section 3' }), 'Social media');
  await user.click(dialog.getByRole('button', { name: 'Move section 3 up' }));
  await user.click(dialog.getByRole('button', { name: 'Save sections' }));
  expect(await screen.findByRole('alertdialog', { name: 'Sections saved' })).toBeTruthy();
  expect((await client.listContentTypes())[0]?.sections).toEqual([
    { key: 'about', label: { en: 'Profile' }, fieldIds: ['f-name', 'f-bio'] },
    { key: 'social-media', label: { en: 'Social media' }, fieldIds: [] },
    { key: 'contact', label: { en: 'Contact' }, fieldIds: ['f-phone'], aside: true },
  ]);
  expect(await screen.findByRole('grid', { name: 'Fields in Profile' })).toBeTruthy();
  expect(within(screen.getByRole('grid', { name: 'Fields in Social media' })).getByText('No fields here yet.')).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Sections' }));
  const again = within(await screen.findByRole('dialog', { name: 'Sections' }));
  await user.click(again.getByRole('button', { name: 'Remove section 3' }));
  await user.click(again.getByRole('button', { name: 'Save sections' }));
  await waitFor(async () => expect((await client.listContentTypes())[0]?.sections?.map((section) => section.key)).toEqual(['about', 'social-media']));
  // Its field is still there, after the sections.
  expect(fieldNames(await screen.findByRole('grid', { name: 'Fields in Other fields' }))).toEqual([expect.stringContaining('Phone')]);
});

it('chooses what entries are called by and what the list of entries shows', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/listings', signedIn);
  await user.click(await screen.findByRole('button', { name: 'Settings' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Settings for Listings' }));
  await user.click(dialog.getByRole('button', { name: /Entries are called by/ }));
  await user.click(await screen.findByRole('option', { name: 'Description' }));
  const columns = within(dialog.getByRole('group', { name: /Columns in lists/ }));
  await user.click(columns.getByRole('checkbox', { name: 'Price' }));
  await user.click(columns.getByRole('checkbox', { name: 'Stage' }));
  await user.click(dialog.getByRole('button', { name: 'Save settings' }));
  expect(await screen.findByRole('alertdialog', { name: 'Settings saved' })).toBeTruthy();
  expect((await client.listContentTypes()).find((type) => type.key === 'listings')).toMatchObject({ titlePath: ['f-description'], list: { fieldPaths: [['f-price'], ['f-stage']] } });

  await user.click(screen.getByRole('link', { name: 'View entries' }));
  const table = await screen.findByRole('grid', { name: 'Listings' });
  expect(within(table).getByRole('columnheader', { name: 'Price' })).toBeTruthy();
  expect(within(table).getByRole('columnheader', { name: 'Stage' })).toBeTruthy();
});

it('lets deals be about a type\'s entries', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/listings', signedIn);
  await user.click(await screen.findByRole('button', { name: 'Settings' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Settings for Listings' }));
  await user.click(dialog.getByRole('checkbox', { name: 'Deals can be about these' }));
  await user.click(dialog.getByRole('button', { name: 'Save settings' }));
  await waitFor(async () => expect((await client.listContentTypes()).find((type) => type.key === 'listings')?.forDeals).toBe(true));
});

it('archives a content type after asking, and restores it from the list of archived ones', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/types/agents', signedIn);
  await user.click(await screen.findByRole('button', { name: 'Archive' }));
  const ask = within(await screen.findByRole('alertdialog', { name: 'Archive Agents?' }));
  expect(ask.getByText(/Its fields and entries are kept/)).toBeTruthy();
  await user.click(ask.getByRole('button', { name: 'Archive content type' }));

  // Back at the list, where it is out of the way but not gone.
  expect(await screen.findByRole('heading', { level: 1, name: 'Content types' })).toBeTruthy();
  expect(await screen.findByRole('alertdialog', { name: 'Agents was archived' })).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Agents' })).toBeNull());
  const archived = within(await screen.findByRole('grid', { name: 'Archived content types' }));
  expect((await client.listContentTypes()).map((type) => type.key)).toEqual(['listings']);

  await user.click(archived.getByRole('button', { name: 'Restore Agents' }));
  expect(await screen.findByRole('alertdialog', { name: 'Agents was restored' })).toBeTruthy();
  expect(await screen.findByRole('link', { name: 'Agents' })).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('grid', { name: 'Archived content types' })).toBeNull());
  expect((await client.listContentTypes()).map((type) => type.key)).toEqual(['agents', 'listings']);
});
