import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleEntries, sampleUser } from '../../testing/sample-content.js';

const signedIn = { user: sampleUser, contentTypes: sampleContentTypes, entries: sampleEntries() };

it('greets the person and counts where the content stands', async () => {
  renderApp('/', signedIn);
  // Home opens on its greeting, with what is waiting set apart: two drafts and one entry with changes.
  const headline = await screen.findByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Dana\. 3 drafts are waiting\.$/ });
  expect(headline.querySelector('mark')?.textContent).toBe('3 drafts');
  // Its bar holds no title of its own, so the greeting is the screen's one heading.
  expect(within(screen.getByRole('banner')).queryByRole('heading')).toBeNull();
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

it('carries on with the latest entry that is waiting', async () => {
  const user = userEvent.setup();
  renderApp('/', signedIn);
  await user.click(await screen.findByRole('button', { name: 'Continue “18 Alder Court”' }));
  expect(await screen.findByRole('heading', { level: 1, name: '18 Alder Court' })).toBeTruthy();
});

it('shows the site as visitors see it, beside the greeting', async () => {
  renderApp('/', signedIn);
  const frame = (await screen.findByTitle('The home page of Lakeshore Realty, as visitors see it')) as HTMLIFrameElement;
  expect(frame.getAttribute('src')).toBe('/');
  expect(screen.getByRole('link', { name: 'Open the site' })).toBeTruthy();
});

it('draws how the content and what came in stand as charts, for those who may read submissions', async () => {
  const { unmount } = renderApp('/', signedIn);
  const byType = await screen.findByRole('figure', { name: 'Content by type' });
  expect(within(byType).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Listings: 4 entries', 'Agents: 0 entries']);
  const perDay = await screen.findByRole('figure', { name: 'Submissions' });
  expect(within(perDay).getAllByRole('listitem')).toHaveLength(14);
  unmount();
  renderApp('/', { ...signedIn, user: { ...sampleUser, role: 'author' } });
  await screen.findByRole('figure', { name: 'Content by type' });
  expect(screen.queryByRole('figure', { name: 'Submissions' })).toBeNull();
});

it('says what came in from the forms, and what the open deals are worth, to those who may read them', async () => {
  const { unmount } = renderApp('/', signedIn);
  const inbox = within(await screen.findByRole('region', { name: 'Inbox' }));
  expect(inbox.getByRole('link', { name: 'All forms' })).toBeTruthy();
  unmount();
  renderApp('/', { ...signedIn, user: { ...sampleUser, role: 'author' } });
  await screen.findByRole('grid', { name: 'Recent changes' });
  expect(screen.queryByRole('region', { name: 'Inbox' })).toBeNull();
});

it('says everything is published when nothing is waiting', async () => {
  const published = sampleEntries().filter((entry) => entry.status === 'published' && entry.published?.revision === entry.revision);
  renderApp('/', { ...signedIn, entries: published });
  const headline = await screen.findByRole('heading', { level: 1, name: /Everything is published\.$/ });
  expect(headline.querySelector('mark')).toBeNull();
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

it('leads straight to the home page, with its page given the whole window', async () => {
  const user = userEvent.setup();
  const pages = { id: 'type-pages', key: 'pages', kind: 'collection' as const, label: { en: 'Pages' }, urlPattern: '/[...slug]', titlePath: ['f-page-title'], fields: [{ id: 'f-page-title', key: 'title', type: 'text', label: { en: 'Title' }, required: true, translated: false, options: {} }] };
  const home = { id: 'h', typeId: 'type-pages', locale: 'en', translationGroup: 'h', slug: 'index', status: 'draft' as const, data: { 'f-page-title': 'Homes for sale and for rent' }, revision: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  renderApp('/', { ...signedIn, contentTypes: [...sampleContentTypes, pages], entries: [...sampleEntries(), home] });
  await user.click(await screen.findByRole('button', { name: 'Edit the home page' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Homes for sale and for rent' })).toBeTruthy();
});

it('offers no way to a home page a site does not have', async () => {
  renderApp('/', signedIn);
  expect(await screen.findByRole('button', { name: 'View the site' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit the home page' })).toBeNull();
});
