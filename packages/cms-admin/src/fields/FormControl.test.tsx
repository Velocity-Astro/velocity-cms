import { act, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity/cms-ui';
import type { ContentTypeDef, Entry } from '@velocity/cms-core';
import { afterEach, expect, it } from 'vitest';
import { renderApp } from '../testing/render-app.js';
import { sampleForms, sampleUser } from '../testing/sample-content.js';

const notes: ContentTypeDef = {
  id: 'type-notes',
  key: 'notes',
  kind: 'collection',
  label: { en: 'Notes' },
  fields: [
    { id: 'f-title', key: 'title', type: 'text', label: { en: 'Title' }, translated: true, required: true, options: {} },
    { id: 'f-form', key: 'form', type: 'form', label: { en: 'Form' }, translated: false, required: false, options: {} },
  ],
};
const note = (form?: string): Entry => ({
  id: 'n1',
  typeId: 'type-notes',
  locale: 'en',
  translationGroup: 'n1',
  slug: 'ask',
  status: 'draft',
  data: { 'f-title': 'Ask us', ...(form !== undefined && { 'f-form': form }) },
  revision: 1,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
});
const open = (form?: string, forms = sampleForms) => renderApp('/content/notes/n1', { user: sampleUser, contentTypes: [notes], entries: [note(form)], forms });

afterEach(() => act(() => dismissToasts()));

it('offers the site\'s forms by name and stores the id of the one chosen', async () => {
  const user = userEvent.setup();
  const { client } = open();
  await user.click(await screen.findByRole('button', { name: /Choose one.*Form/ }));
  expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Book a tour', 'Contact us']);
  await user.click(screen.getByRole('option', { name: 'Contact us' }));
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Draft saved')).toBeTruthy();
  const contact = (await client.listForms()).find((form) => form.key === 'contact');
  expect((await client.getEntry('n1')).data['f-form']).toBe(contact?.id);
});

it('keeps a choice whose form is gone, and says so', async () => {
  open('gone');
  expect(await screen.findByRole('button', { name: /A form that is no longer here.*Form/ })).toBeTruthy();
});

it('says where forms are made when the site has none', async () => {
  open(undefined, []);
  expect(await screen.findByText('This site has no forms yet. Make one under Forms.')).toBeTruthy();
});
