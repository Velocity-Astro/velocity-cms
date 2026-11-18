import { act, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity/cms-ui';
import { afterEach, expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleForms, sampleSubmissions, sampleUser } from '../../testing/sample-content.js';

const signedIn = (role: 'owner' | 'editor' | 'author' = 'owner') => ({ user: { ...sampleUser, role }, contentTypes: sampleContentTypes, forms: sampleForms, submissions: sampleSubmissions });

afterEach(() => act(() => dismissToasts()));

it('is reached from the sidebar by an owner or an editor, and not offered to an author', async () => {
  const user = userEvent.setup();
  const { unmount } = renderApp('/', signedIn('editor'));
  await user.click(await screen.findByRole('link', { name: 'Forms' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Forms' })).toBeTruthy();
  unmount();
  renderApp('/', signedIn('author'));
  await screen.findByRole('link', { name: 'Listings' });
  expect(screen.queryByRole('link', { name: 'Forms' })).toBeNull();
});

it('lists every form with its key, its fields, how much is new and whether it is open', async () => {
  renderApp('/forms', signedIn());
  const table = within(await screen.findByRole('grid', { name: 'Forms' }));
  const contact = within(table.getByRole('row', { name: /Contact us/ }));
  expect(contact.getByText('contact')).toBeTruthy();
  expect(contact.getByText('3 fields')).toBeTruthy();
  expect(await contact.findByText('2 new')).toBeTruthy();
  expect(contact.getByText('Open')).toBeTruthy();
  expect(await within(table.getByRole('row', { name: /Book a tour/ })).findByText('1 new')).toBeTruthy();
});

it('says so when there are no forms, and starts one with a key made from its name', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/forms', { user: sampleUser, contentTypes: sampleContentTypes });
  expect(await screen.findByRole('heading', { level: 2, name: 'No forms yet' })).toBeTruthy();
  await user.click(screen.getAllByRole('button', { name: 'New form' })[0] as HTMLElement);
  const dialog = within(await screen.findByRole('dialog', { name: 'New form' }));
  await user.click(dialog.getByRole('button', { name: 'Create form' }));
  expect(await dialog.findByText('Give the form a name.')).toBeTruthy();
  await user.type(dialog.getByRole('textbox', { name: /^Name/ }), 'Ask a question');
  expect((dialog.getByRole('textbox', { name: /^Key/ }) as HTMLInputElement).value).toBe('ask-a-question');
  await user.click(dialog.getByRole('button', { name: 'Create form' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Ask a question' })).toBeTruthy();
  expect(await screen.findByRole('heading', { level: 2, name: 'No fields yet' })).toBeTruthy();
  expect((await client.listForms()).map((form) => form.key)).toEqual(['ask-a-question']);
});

it('puts the server\'s refusal on the key and keeps what was typed', async () => {
  const user = userEvent.setup();
  renderApp('/forms', signedIn());
  await user.click(await screen.findByRole('button', { name: 'New form' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'New form' }));
  await user.type(dialog.getByRole('textbox', { name: /^Name/ }), 'Contact');
  await user.click(dialog.getByRole('button', { name: 'Create form' }));
  expect((await dialog.findAllByText(/already/)).length).toBeGreaterThan(0);
  expect((dialog.getByRole('textbox', { name: /^Name/ }) as HTMLInputElement).value).toBe('Contact');
});

it('restores a form from the trash, and deletes one for good only after asking', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/', signedIn());
  const [contact, tour] = await client.listForms();
  await client.trashForm(contact?.id ?? '');
  await client.trashForm(tour?.id ?? '');
  await user.click(await screen.findByRole('link', { name: 'Forms' }));
  const trashed = within(await screen.findByRole('grid', { name: 'Forms in the trash' }));
  await user.click(trashed.getByRole('button', { name: 'Restore Contact us' }));
  expect(await screen.findByText('Contact us restored')).toBeTruthy();
  expect(await within(await screen.findByRole('grid', { name: 'Forms' })).findByRole('row', { name: /Contact us/ })).toBeTruthy();

  await user.click(trashed.getByRole('button', { name: 'Delete Book a tour for good' }));
  const asking = within(await screen.findByRole('alertdialog', { name: 'Delete Book a tour for good?' }));
  expect(asking.getByText(/everything visitors sent through it/)).toBeTruthy();
  await user.click(asking.getByRole('button', { name: 'Delete for good' }));
  expect(await screen.findByText('Book a tour deleted for good')).toBeTruthy();
  expect(await client.listTrashedForms()).toEqual([]);
});

it('forgets a person: everything they sent goes, through every form', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/forms', signedIn('editor'));
  await user.click(await screen.findByRole('button', { name: 'Forget a person' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Forget a person' }));
  await user.click(dialog.getByRole('button', { name: 'Delete what they sent' }));
  expect(await dialog.findByText('Give the email address of the person to forget.')).toBeTruthy();
  await user.type(dialog.getByRole('textbox', { name: /Their email address/ }), 'Ana@example.com');
  await user.click(dialog.getByRole('button', { name: 'Delete what they sent' }));
  expect(await screen.findByText('2 submissions deleted')).toBeTruthy();
  const [contact, tour] = await client.listForms();
  expect((await client.listSubmissions({ formId: contact?.id ?? '' })).total).toBe(2);
  expect((await client.listSubmissions({ formId: tour?.id ?? '' })).total).toBe(0);
});
