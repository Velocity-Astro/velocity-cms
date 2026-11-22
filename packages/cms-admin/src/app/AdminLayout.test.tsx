import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from '../testing/render-app.js';
import { sampleContentTypes, sampleEntries, sampleForms, sampleSubmissions, sampleUser } from '../testing/sample-content.js';

const signedIn = (role: 'owner' | 'editor' | 'author' = 'owner') => ({
  user: { ...sampleUser, role },
  contentTypes: sampleContentTypes,
  entries: sampleEntries(),
  forms: sampleForms,
  submissions: sampleSubmissions,
});

it('opens the search from the bar and goes where the person chooses', async () => {
  const user = userEvent.setup();
  renderApp('/', signedIn());
  await user.click(await screen.findByRole('button', { name: 'Search' }));
  const search = within(await screen.findByRole('dialog', { name: 'Search and commands' }));
  await user.keyboard('agen');
  expect(search.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['AgentsContent', 'New in Agents']);
  await user.click(search.getByRole('menuitem', { name: /^Agents/ }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Agents' })).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: 'Search and commands' })).toBeNull();
});

it('opens the search with Ctrl or Command and K, wherever the person is', async () => {
  const user = userEvent.setup();
  renderApp('/content/listings', signedIn());
  await screen.findByRole('heading', { level: 1, name: 'Listings' });
  await user.keyboard('{Control>}k{/Control}');
  expect(await screen.findByRole('dialog', { name: 'Search and commands' })).toBeTruthy();
  await user.keyboard('{Escape}');
  await user.keyboard('{Meta>}k{/Meta}');
  expect(await screen.findByRole('dialog', { name: 'Search and commands' })).toBeTruthy();
});

it('starts a new entry from the search', async () => {
  const user = userEvent.setup();
  renderApp('/', signedIn());
  await user.keyboard('{Control>}k{/Control}');
  await user.click(await screen.findByRole('menuitem', { name: 'New in Listings' }));
  expect(await screen.findByRole('textbox', { name: /^Slug/ })).toBeTruthy();
});

it('offers only the places a person may go', async () => {
  const user = userEvent.setup();
  renderApp('/', signedIn('author'));
  await user.keyboard('{Control>}k{/Control}');
  const search = within(await screen.findByRole('dialog', { name: 'Search and commands' }));
  const offered = search.getAllByRole('menuitem').map((item) => item.textContent);
  expect(offered).toContain('TrashContent');
  for (const hidden of ['Forms', 'Contacts', 'Deals', 'People', 'Content types']) expect(offered.some((words) => words?.startsWith(hidden))).toBe(false);
});

it('finds an entry by what it holds, such as part of its address, and opens it', async () => {
  const user = userEvent.setup();
  renderApp('/', signedIn());
  await user.keyboard('{Control>}k{/Control}');
  const search = within(await screen.findByRole('dialog', { name: 'Search and commands' }));
  await user.keyboard('santa fe');
  const found = await search.findByRole('menuitem', { name: /907 Mesa Verde Lane/ });
  expect(found.textContent).toBe('907 Mesa Verde LaneListings');
  await user.click(found);
  expect(await screen.findByRole('textbox', { name: /^Slug/ })).toHaveProperty('value', '907-mesa-verde-lane');
});

it('finds a contact by name or email for an owner or an editor, and never for an author', async () => {
  const user = userEvent.setup();
  const { unmount } = renderApp('/', signedIn('editor'));
  await user.keyboard('{Control>}k{/Control}');
  let search = within(await screen.findByRole('dialog', { name: 'Search and commands' }));
  await user.keyboard('ana@exa');
  await user.click(await search.findByRole('menuitem', { name: /Ana Ruiz/ }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Ana Ruiz' })).toBeTruthy();
  unmount();

  renderApp('/', signedIn('author'));
  await user.keyboard('{Control>}k{/Control}');
  search = within(await screen.findByRole('dialog', { name: 'Search and commands' }));
  await user.keyboard('ana');
  expect(await search.findByText('Nothing matches that.')).toBeTruthy();
  expect(search.queryByRole('menuitem', { name: /Ana Ruiz/ })).toBeNull();
});
