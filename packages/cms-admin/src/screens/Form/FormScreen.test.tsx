import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity/cms-ui';
import { afterEach, expect, it, vi } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleForms, sampleSubmissions, sampleUser } from '../../testing/sample-content.js';

const signedIn = (role: 'owner' | 'editor' | 'author' = 'owner') => ({ user: { ...sampleUser, role }, contentTypes: sampleContentTypes, forms: sampleForms, submissions: sampleSubmissions });

/** Opens the editor on the contact form, the way a person gets there. */
async function openContact(role: 'owner' | 'editor' | 'author' = 'owner') {
  const user = userEvent.setup();
  const rendered = renderApp('/forms', signedIn(role));
  await user.click(await within(await screen.findByRole('grid', { name: 'Forms' })).findByRole('row', { name: /Contact us/ }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Contact us' })).toBeTruthy();
  const [contact] = await rendered.client.listForms();
  if (!contact) throw new Error('No form');
  return { user, contact, ...rendered };
}

afterEach(() => {
  vi.unstubAllGlobals();
  return act(() => dismissToasts());
});

it('shows what is new first, with who sent it and what they wrote, and the other lists by their count', async () => {
  const { user } = await openContact();
  const table = within(await screen.findByRole('grid', { name: 'Submissions of Contact us' }));
  expect(table.getAllByRole('row')).toHaveLength(3);
  const ana = within(table.getByRole('row', { name: /Ana Ruiz/ }));
  expect(ana.getByText('ana@example.com')).toBeTruthy();
  expect(ana.getByText('Is the house on Alder still for sale?')).toBeTruthy();

  await user.click(await screen.findByRole('radio', { name: 'Spam (1)' }));
  expect(await within(await screen.findByRole('grid', { name: 'Submissions of Contact us' })).findByRole('row', { name: /Cheap Loans/ })).toBeTruthy();
  await user.click(screen.getByRole('radio', { name: 'Handled (0)' }));
  expect(await screen.findByRole('heading', { name: 'Nothing handled yet' })).toBeTruthy();
});

it('opens a submission in full, as text, and marks it handled', async () => {
  const { user, client, contact } = await openContact('editor');
  await user.click(await screen.findByRole('row', { name: /Tom Okafor/ }));
  const dialog = within(await screen.findByRole('dialog', { name: 'From Tom Okafor' }));
  expect(dialog.getByText('Your name')).toBeTruthy();
  expect(dialog.getByText('We would like to list our home.')).toBeTruthy();
  expect(dialog.getByText('Call any time.')).toBeTruthy();
  expect(dialog.getByText('Sent from /sell/')).toBeTruthy();

  await user.click(dialog.getByRole('button', { name: 'Mark as handled' }));
  expect(await screen.findByText('Marked as handled')).toBeTruthy();
  expect(await screen.findByRole('radio', { name: 'Handled (1)' })).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('row', { name: /Tom Okafor/ })).toBeNull());
  expect(await client.countSubmissions(contact.id)).toEqual({ new: 1, handled: 1, spam: 1 });
});

it('takes a real one out of spam, and deletes a submission only after asking', async () => {
  const { user, client, contact } = await openContact();
  await user.click(await screen.findByRole('radio', { name: 'Spam (1)' }));
  await user.click(await screen.findByRole('row', { name: /Cheap Loans/ }));
  await user.click(within(await screen.findByRole('dialog', { name: 'From Cheap Loans' })).getByRole('button', { name: 'Not spam' }));
  expect(await screen.findByText('Marked as new')).toBeTruthy();
  expect(await screen.findByRole('radio', { name: 'New (3)' })).toBeTruthy();

  await user.click(screen.getByRole('radio', { name: 'New (3)' }));
  await user.click(await screen.findByRole('row', { name: /Cheap Loans/ }));
  await user.click(within(await screen.findByRole('dialog', { name: 'From Cheap Loans' })).getByRole('button', { name: 'Delete' }));
  await user.click(within(await screen.findByRole('alertdialog', { name: 'Delete this submission?' })).getByRole('button', { name: 'Delete' }));
  expect(await screen.findByText('Submission deleted')).toBeTruthy();
  expect((await client.listSubmissions({ formId: contact.id })).total).toBe(2);
});

it('saves the export as a file and says to keep it safe', async () => {
  const saved: Blob[] = [];
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (blob: Blob) => (saved.push(blob), 'blob:export'), revokeObjectURL: () => undefined }));
  const { user } = await openContact();
  await user.click(await screen.findByRole('button', { name: 'Export as CSV' }));
  expect(await screen.findByText('Export saved')).toBeTruthy();
  expect(await saved[0]?.text()).toContain('received,status,page,name,email,message');
});

it('lists the fields with their kind and what they hold, and adds one a visitor can fill in', async () => {
  const { user, client } = await openContact();
  await user.click(screen.getByRole('tab', { name: 'Fields' }));
  const table = within(await screen.findByRole('grid', { name: 'Fields of Contact us' }));
  const email = within(table.getByRole('row', { name: /^Email/ }));
  expect(email.getByText('Email address')).toBeTruthy();
  expect(email.getByText('Required')).toBeTruthy();
  expect(email.getByText("Sender's email")).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Add field' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Add a field' }));
  await user.click(dialog.getByRole('button', { name: /Kind/ }));
  const kinds = within(await screen.findByRole('listbox')).getAllByRole('option').map((option) => option.textContent);
  expect(kinds).toContain('Phone number');
  expect(kinds).not.toContain('Formatted text');
  expect(kinds).not.toContain('Image');
  await user.click(screen.getByRole('option', { name: 'Phone number' }));
  await user.type(dialog.getByRole('textbox', { name: /^Label/ }), 'Phone number');
  expect((dialog.getByRole('textbox', { name: /^Key/ }) as HTMLInputElement).value).toBe('phoneNumber');
  await user.click(dialog.getByRole('button', { name: 'Add field' }));
  expect(await screen.findByText('Phone number added')).toBeTruthy();
  const [contact] = await client.listForms();
  expect(contact?.fields.map((field) => [field.key, field.type])).toEqual([['name', 'text'], ['email', 'email'], ['message', 'text'], ['phoneNumber', 'phone']]);
});

it('changes, moves and removes a field, each keeping what was already sent', async () => {
  const { user, client, contact: before } = await openContact();
  await user.click(screen.getByRole('tab', { name: 'Fields' }));
  await user.click(await screen.findByRole('button', { name: 'Change Message' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Change Message' }));
  const label = dialog.getByRole('textbox', { name: /^Label/ });
  await user.clear(label);
  await user.type(label, 'How can we help?');
  await user.click(dialog.getByRole('button', { name: 'Save field' }));
  expect(await screen.findByText('How can we help? saved')).toBeTruthy();

  await user.click(await screen.findByRole('button', { name: 'Move How can we help? up' }));
  await waitFor(async () => expect((await client.listForms())[0]?.fields.map((field) => field.key)).toEqual(['name', 'message', 'email']));

  await user.click(screen.getByRole('button', { name: 'Remove Your name' }));
  await user.click(within(await screen.findByRole('alertdialog', { name: 'Remove Your name?' })).getByRole('button', { name: 'Remove field' }));
  expect(await screen.findByText('Your name removed')).toBeTruthy();
  const [after] = await client.listForms();
  const idOf = (key: string) => before.fields.find((field) => field.key === key)?.id;
  expect(after?.fields.find((field) => field.id === idOf('message'))).toMatchObject({ key: 'message', label: { en: 'How can we help?' } });
  expect(after?.fields.find((field) => field.id === idOf('name'))?.deletedAt).toBeDefined();
  expect(after?.contact).toEqual({ email: idOf('email') });
});

it('saves the settings: who is emailed, whether it is open and how long answers are kept', async () => {
  const { user, client } = await openContact();
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Settings of Contact us' }));
  const notify = dialog.getByRole('textbox', { name: /Who is emailed/ });
  expect((notify as HTMLTextAreaElement).value).toBe('office@example.com');
  await user.type(notify, '{Enter}not an address');
  await user.click(dialog.getByRole('button', { name: 'Save settings' }));
  expect((await dialog.findAllByText(/"not an address" is not an email address/)).length).toBeGreaterThan(0);

  await user.clear(notify);
  await user.type(notify, 'office@example.com{Enter}Ben@Example.com');
  await user.click(dialog.getByRole('switch', { name: 'Taking submissions' }));
  await user.type(dialog.getByRole('textbox', { name: /Days to keep submissions/ }), '90');
  await user.click(dialog.getByRole('button', { name: 'Save settings' }));
  expect(await screen.findByText('Settings saved')).toBeTruthy();
  const [contact] = await client.listForms();
  expect(contact).toMatchObject({ notify: ['office@example.com', 'ben@example.com'], open: false, retentionDays: 90, contact: { name: expect.any(String) as string, email: expect.any(String) as string } });
  expect(await screen.findByText('Key: contact · Closed')).toBeTruthy();
});

it('moves the form to the trash after asking, and goes back to the list', async () => {
  const { user, client } = await openContact();
  await user.click(screen.getByRole('button', { name: 'Move to trash' }));
  await user.click(within(await screen.findByRole('alertdialog', { name: 'Move Contact us to the trash?' })).getByRole('button', { name: 'Move to trash' }));
  expect(await screen.findByText('Contact us moved to the trash')).toBeTruthy();
  expect(await screen.findByRole('heading', { level: 1, name: 'Forms' })).toBeTruthy();
  expect((await client.listTrashedForms()).map((form) => form.key)).toEqual(['contact']);
});

it('says so for a form that is not there', async () => {
  renderApp('/forms/nothing', signedIn());
  expect(await screen.findByRole('heading', { name: 'This form is not here' })).toBeTruthy();
});
