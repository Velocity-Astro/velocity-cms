import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleEntries, sampleUser } from '../../testing/sample-content.js';

const signedIn = { user: sampleUser, contentTypes: sampleContentTypes, entries: sampleEntries() };

it('greets the person and counts where the content stands', async () => {
  renderApp('/', signedIn);
  expect(await screen.findByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Dana$/ })).toBeTruthy();
  expect(within(await screen.findByRole('group', { name: 'Published' })).getByText('2')).toBeTruthy();
  expect(within(screen.getByRole('group', { name: 'Drafts' })).getByText('2')).toBeTruthy();
  expect(within(screen.getByRole('group', { name: 'Unpublished changes' })).getByText('1')).toBeTruthy();
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect(within(nav).getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
});

it('lists the latest changes across every type, newest first, and opens one', async () => {
  const user = userEvent.setup();
  renderApp('/', signedIn);
  const table = await screen.findByRole('grid', { name: 'Recent changes' });
  const titles = within(table)
    .getAllByRole('rowheader')
    .map((cell) => cell.textContent);
  expect(titles).toEqual(['6214 Lakeshore Drive', '18 Alder Court', '907 Mesa Verde Lane', 'Untitled']);
  await user.click(within(table).getByRole('rowheader', { name: '18 Alder Court' }));
  expect(await screen.findByRole('heading', { level: 1, name: '18 Alder Court' })).toBeTruthy();
});

it('starts a new entry of a type from its button', async () => {
  const user = userEvent.setup();
  renderApp('/', signedIn);
  await user.click(await screen.findByRole('button', { name: 'Agents' }));
  expect(await screen.findByRole('region', { name: 'Save and publish' })).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Save and publish' })).getByRole('link', { name: 'Agents' })).toBeTruthy();
});

it('says so when nothing has been written yet', async () => {
  renderApp('/', { user: sampleUser, contentTypes: sampleContentTypes });
  expect(await screen.findByRole('heading', { name: 'Nothing has been written yet' })).toBeTruthy();
  expect(within(screen.getByRole('group', { name: 'Published' })).getByText('0')).toBeTruthy();
});

it('shows what went wrong and tries again when asked', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/agents', signedIn);
  await screen.findByRole('heading', { level: 2, name: 'No agents yet' });
  client.failNextWith = 'The server did not answer.';
  await user.click(screen.getByRole('link', { name: 'Home' }));
  expect(await screen.findByText('The server did not answer.')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('grid', { name: 'Recent changes' })).toBeTruthy();
});
