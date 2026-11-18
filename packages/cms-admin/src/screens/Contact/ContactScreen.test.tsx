import { act, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity/cms-ui';
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
