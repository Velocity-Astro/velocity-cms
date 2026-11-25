import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity-astro/cms-ui';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryAdminClient } from '../../testing/memory-client.js';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleForms, sampleSubmissions, sampleUser } from '../../testing/sample-content.js';

const site = { user: sampleUser, contentTypes: sampleContentTypes, forms: sampleForms, submissions: sampleSubmissions };
/** Ana's page, opened from the list as a person would. */
const openAna = async (user: ReturnType<typeof userEvent.setup>) => {
  const app = renderApp('/contacts', site);
  await user.click(await screen.findByRole('row', { name: /Ana Ruiz/ }));
  await screen.findByRole('heading', { level: 1, name: 'Ana Ruiz' });
  return app;
};

afterEach(() => {
  vi.restoreAllMocks();
  return act(() => dismissToasts());
});

it('shows who a contact is and what they sent, newest first, under each field\'s label', async () => {
  const user = userEvent.setup();
  await openAna(user);
  const details = within(screen.getByRole('region', { name: 'Details' }));
  expect(details.getByText('ana@example.com')).toBeTruthy();
  expect(details.getByText('Not given')).toBeTruthy();
  expect(await details.findByText('Contact us form on /contact/')).toBeTruthy();
  const timeline = within(screen.getByRole('region', { name: 'Timeline' }));
  expect(await timeline.findByText('Sent the Book a tour form')).toBeTruthy();
  expect(timeline.getByText('Sent the Contact us form')).toBeTruthy();
  expect(timeline.getByText('Is the house on Alder still for sale?')).toBeTruthy();
  expect(timeline.getByText('From /listings/18-alder-court/')).toBeTruthy();
  expect(timeline.getByText('Preferred day')).toBeTruthy();
});

it('adds a note to the timeline and deletes it', async () => {
  const user = userEvent.setup();
  const { client } = await openAna(user);
  const add = screen.getByRole('button', { name: 'Add note' });
  expect(add.hasAttribute('disabled')).toBe(true);
  await user.type(screen.getByRole('textbox', { name: 'Add a note' }), 'Called back, wants a tour.');
  await user.click(add);
  expect(await screen.findByText('Note added')).toBeTruthy();
  const timeline = within(screen.getByRole('region', { name: 'Timeline' }));
  expect(await timeline.findByText('Called back, wants a tour.')).toBeTruthy();
  expect((screen.getByRole('textbox', { name: 'Add a note' }) as HTMLTextAreaElement).value).toBe('');
  await user.click(timeline.getByRole('button', { name: 'Delete note' }));
  expect(await screen.findByText('Note deleted')).toBeTruthy();
  const [ana] = (await client.listContacts({ search: 'ana' })).items;
  expect((await client.contactTimeline(ana?.id ?? '')).map((item) => item.kind)).toEqual(['submission', 'submission']);
});

it('changes a contact\'s details, and shows a refusal on the field it names', async () => {
  const user = userEvent.setup();
  await openAna(user);
  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Edit Ana Ruiz' }));
  const email = dialog.getByRole('textbox', { name: /^Email/ });
  await user.clear(email);
  await user.type(email, 'tom@example.com');
  await user.click(dialog.getByRole('button', { name: 'Save details' }));
  expect(await dialog.findByText('Another contact has this email address.')).toBeTruthy();
  await user.clear(email);
  await user.type(email, 'ana.ruiz@example.com');
  await user.type(dialog.getByRole('textbox', { name: /^Phone/ }), '512 555 0142');
  await user.click(dialog.getByRole('button', { name: 'Save details' }));
  expect(await screen.findByText('Ana Ruiz saved')).toBeTruthy();
  const details = within(screen.getByRole('region', { name: 'Details' }));
  expect(await details.findByText('512 555 0142')).toBeTruthy();
  expect(details.getByText('ana.ruiz@example.com')).toBeTruthy();
});

it('keeps what someone else changed about a contact while its details were open here', async () => {
  const user = userEvent.setup();
  const { client } = await openAna(user);
  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Edit Ana Ruiz' }));
  await user.type(dialog.getByRole('textbox', { name: /^Phone/ }), '512 555 0142');
  // Meanwhile someone else, or an agent, renames her.
  const [ana] = (await client.listContacts({ search: 'ana@' })).items;
  if (!ana) throw new Error('Ana is not among the contacts.');
  await client.updateContact(ana.id, { name: 'Ana Ruiz-Ortega', expectedRevision: ana.revision });
  await user.click(dialog.getByRole('button', { name: 'Save details' }));
  // The save is refused, the newer contact comes into the open form, and the phone number typed here stays.
  expect(await screen.findByText(/Someone else saved this a moment ago/)).toBeTruthy();
  await waitFor(() => expect((dialog.getByRole('textbox', { name: /^Name/ }) as HTMLInputElement).value).toBe('Ana Ruiz-Ortega'));
  expect((dialog.getByRole('textbox', { name: /^Phone/ }) as HTMLInputElement).value).toBe('512 555 0142');
  await user.click(dialog.getByRole('button', { name: 'Save details' }));
  expect(await screen.findByText('Ana Ruiz-Ortega saved')).toBeTruthy();
  const [now] = (await client.listContacts({ search: 'ana@' })).items;
  expect(now).toMatchObject({ name: 'Ana Ruiz-Ortega', phone: '512 555 0142' });
});

it('hands over a person\'s file, with a word about keeping it safe', async () => {
  const user = userEvent.setup();
  const made: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => {
    made.push(file as Blob);
    return 'blob:file';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  await openAna(user);
  await user.click(screen.getByRole('button', { name: 'Export' }));
  expect(await screen.findByText('File downloaded')).toBeTruthy();
  expect(screen.getByText('The file holds personal details. Keep it somewhere safe.')).toBeTruthy();
  expect(await made[0]?.text()).toContain('"email": "ana@example.com"');
});

it('erases a person with everything they sent, after asking', async () => {
  const user = userEvent.setup();
  const { client } = await openAna(user);
  await user.click(screen.getByRole('button', { name: 'Erase' }));
  const dialog = within(await screen.findByRole('alertdialog', { name: 'Erase Ana Ruiz?' }));
  await user.click(dialog.getByRole('button', { name: 'Erase for good' }));
  expect(await screen.findByText('Ana Ruiz erased, with 2 submissions')).toBeTruthy();
  expect(await screen.findByRole('heading', { level: 1, name: 'Contacts' })).toBeTruthy();
  expect((await client.listContacts()).items.map((contact) => contact.email)).toEqual(['tom@example.com']);
  expect(client).toBeInstanceOf(MemoryAdminClient);
});

it('says so for a contact that is not there', async () => {
  renderApp('/contacts/nobody', site);
  expect(await screen.findByRole('heading', { level: 2, name: 'No such contact' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'All contacts' })).toBeTruthy();
});

it('moves a contact to a stage, gives it to someone and sets a day to follow up, each saved as it is chosen', async () => {
  const user = userEvent.setup();
  const { client } = await openAna(user);
  const work = within(screen.getByRole('region', { name: 'Follow-up' }));
  await user.click(await work.findByRole('button', { name: /Stage$/ }));
  await user.click(await screen.findByRole('option', { name: 'Qualified' }));
  expect(await screen.findByText('Moved to Qualified')).toBeTruthy();
  // The move is on the timeline, with who made it.
  expect(await screen.findByText('From New to Qualified, by Dana')).toBeTruthy();
  await waitFor(() => expect(work.getByRole('button', { name: /Looked after by$/ })).toHaveProperty('disabled', false));
  await user.click(work.getByRole('button', { name: /Looked after by$/ }));
  await user.click(await screen.findByRole('option', { name: 'Dana' }));
  expect(await screen.findByText('Now looked after by Dana')).toBeTruthy();
  const [ana] = (await client.listContacts({ search: 'ana' })).items;
  expect(ana).toMatchObject({ stage: 'qualified', ownerId: 'u1' });
  await waitFor(() => expect(work.getByRole('button', { name: /Looked after by$/ }).textContent).toContain('Dana'));
});

it('lists on Home the contacts a person looks after that are due, and opens one', async () => {
  const user = userEvent.setup();
  const { client } = await openAna(user);
  const all = (await client.listContacts()).items;
  const ana = all.find((contact) => contact.email === 'ana@example.com');
  const tom = all.find((contact) => contact.email !== 'ana@example.com');
  if (!ana || !tom) throw new Error('Contacts are missing');
  await client.updateContact(ana.id, { ownerId: 'u1', followUpAt: '2020-01-01', expectedRevision: ana.revision });
  // Tom is due later, so he is not listed.
  await client.updateContact(tom.id, { ownerId: 'u1', followUpAt: '2999-01-01', expectedRevision: tom.revision });
  await user.click(screen.getByRole('link', { name: 'Home' }));
  const due = within(await screen.findByRole('grid', { name: 'Follow-ups' }));
  expect(due.getAllByRole('row')).toHaveLength(2);
  expect(within(due.getByRole('row', { name: /Ana Ruiz/ })).getByText('Overdue')).toBeTruthy();
  await user.click(due.getByRole('rowheader', { name: 'Ana Ruiz' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Ana Ruiz' })).toBeTruthy();
});

it('adds a field of the site\'s own to contacts, and fills it in on one', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/contacts', site);
  await user.click(await screen.findByRole('button', { name: 'Custom fields' }));
  const fields = within(await screen.findByRole('dialog', { name: 'Custom fields for contacts' }));
  expect(await fields.findByText(/Add what you want to know about each contact/)).toBeTruthy();
  await user.click(fields.getByRole('button', { name: 'Add field' }));
  const adding = within(await screen.findByRole('dialog', { name: 'Add a field' }));
  // No custom field can be one that must be filled in: a contact from a form could not be.
  expect(adding.queryByRole('checkbox', { name: /must fill this in/ })).toBeNull();
  await user.type(adding.getByRole('textbox', { name: /^Label/ }), 'Membership type');
  await user.click(adding.getByRole('button', { name: 'Add field' }));
  expect(await screen.findByText('Membership type added')).toBeTruthy();
  expect(await fields.findByRole('row', { name: /Membership type/ })).toBeTruthy();
  expect((await client.getCustomFields()).contact.map((field) => field.key)).toEqual(['membershipType']);
  await user.click(fields.getByRole('button', { name: 'Close' }));

  await user.click(await screen.findByRole('row', { name: /Ana Ruiz/ }));
  const details = within(await screen.findByRole('region', { name: 'Details' }));
  expect(await details.findByText('Membership type')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Edit details' }));
  const editing = within(await screen.findByRole('dialog', { name: 'Edit Ana Ruiz' }));
  await user.type(await editing.findByRole('textbox', { name: /^Membership type/ }), 'Yearly');
  await user.click(editing.getByRole('button', { name: 'Save details' }));
  expect(await details.findByText('Yearly')).toBeTruthy();
  const [ana] = (await client.listContacts({ search: 'ana@' })).items;
  expect(Object.values(ana?.data ?? {})).toEqual(['Yearly']);
});
