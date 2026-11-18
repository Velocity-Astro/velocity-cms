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
