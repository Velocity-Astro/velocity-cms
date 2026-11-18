import { act, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity-astro/cms-ui';
import { afterEach, expect, it } from 'vitest';
import type { MemoryAdminClient } from '../testing/memory-client.js';
import { renderApp } from '../testing/render-app.js';
import { sampleContentTypes, sampleNavigation, sampleNavigationType, samplePage, samplePagesType, sampleUser } from '../testing/sample-content.js';

const menu = () =>
  renderApp('/content/navigation/n1', {
    user: sampleUser,
    contentTypes: [...sampleContentTypes, samplePagesType, sampleNavigationType],
    entries: [samplePage(), sampleNavigation()],
  });
const closed = async () => within(await screen.findByRole('group', { name: 'Header links' }));
/** The list with each link's row opened, as a person would to edit them. */
const rows = async () => {
  const list = await closed();
  for (const name of ['Why list with us', 'Instagram']) await userEvent.click(await list.findByRole('button', { name }));
  return list;
};
const stored = async (client: MemoryAdminClient) => (await client.getEntry('n1')).data['f-header'] as Record<string, unknown>[];
const save = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Draft saved')).toBeTruthy();
  await act(() => dismissToasts());
};
const pick = async (user: ReturnType<typeof userEvent.setup>, button: HTMLElement, option: string) => {
  await user.click(button);
  await user.click(await screen.findByRole('option', { name: option }));
};

afterEach(() => act(() => dismissToasts()));

it('shows a link to a page by the page\'s name, and a typed address as it was typed', async () => {
  menu();
  const list = await rows();
  expect((await list.findAllByRole('button', { name: /Goes to/ })).map((button) => button.textContent)).toEqual(['Pages', 'Another address']);
  expect((await list.findByRole('button', { name: /Which of Pages/ })).textContent).toBe('Why list with us');
  expect(list.getByRole<HTMLInputElement>('textbox', { name: 'Address' }).value).toBe('https://instagram.com/example');
});

it('offers only the kinds of entry that have a page, and stores the entry, not its address', async () => {
  const user = userEvent.setup();
  const { client } = menu();
  const list = await rows();
  const [, second] = await list.findAllByRole('button', { name: /Goes to/ });
  if (!second) throw new Error('The second link is not on screen.');
  await user.click(second);
  expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Agents', 'Listings', 'Pages', 'Another address']);
  await user.click(screen.getByRole('option', { name: 'Pages' }));
  await pick(user, await list.findByRole('button', { name: /Choose one.*Which of Pages/ }), 'Why list with us');
  await save(user);
  expect((await stored(client))[1]).toEqual({ 'f-link-label': 'Instagram', 'f-link-link': { kind: 'entry', type: 'pages', entry: 'p1' } });
});

it('turns a link into an address typed by hand', async () => {
  const user = userEvent.setup();
  const { client } = menu();
  const list = await rows();
  const [first] = await list.findAllByRole('button', { name: /Goes to/ });
  if (!first) throw new Error('The first link is not on screen.');
  await pick(user, first, 'Another address');
  const [address] = list.getAllByRole('textbox', { name: 'Address' });
  if (!address) throw new Error('The address is not on screen.');
  await user.type(address, '/contact/');
  await save(user);
  expect((await stored(client))[0]).toEqual({ 'f-link-label': 'Why list with us', 'f-link-link': { kind: 'address', href: '/contact/' } });
});

it('says what is wrong with an address the site will not link to', async () => {
  const user = userEvent.setup();
  menu();
  const list = await rows();
  const address = await list.findByRole('textbox', { name: 'Address' });
  await user.clear(address);
  await user.type(address, 'javascript:alert(1)');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await list.findByText(/Give a path on this site/)).toBeTruthy();
});

it('shows each link as a row called by its label, closed until it is opened', async () => {
  const user = userEvent.setup();
  menu();
  const list = await closed();
  expect(await list.findByRole('button', { name: 'Why list with us' })).toBeTruthy();
  expect(list.queryByRole('textbox', { name: 'Label' })).toBeNull();
  await user.click(list.getByRole('button', { name: 'Instagram' }));
  expect(list.getByRole<HTMLInputElement>('textbox', { name: 'Label' }).value).toBe('Instagram');
});

it('opens a new row to fill in, and says on a closed row that something in it needs fixing', async () => {
  const user = userEvent.setup();
  menu();
  const list = await closed();
  await user.click(await list.findByRole('button', { name: 'Add' }));
  const label = list.getByRole('textbox', { name: 'Label' });
  await user.type(label, 'Contact');
  expect(list.getByRole('button', { name: 'Contact' })).toBeTruthy();
  await pick(user, list.getByRole('button', { name: /Goes to/ }), 'Another address');
  await user.type(list.getByRole('textbox', { name: 'Address' }), 'javascript:alert(1)');
  await user.click(list.getByRole('button', { name: 'Contact' }));
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await list.findByText('1 thing to fix in here.')).toBeTruthy();
});

it('takes a row out, and makes a copy of one', async () => {
  const user = userEvent.setup();
  const { client } = menu();
  const list = await closed();
  await user.click(await list.findByRole('button', { name: 'More for Header links 1' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Remove' }));
  await user.click(list.getByRole('button', { name: 'More for Header links 1' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
  await save(user);
  expect((await stored(client)).map((item) => item['f-link-label'])).toEqual(['Instagram', 'Instagram']);
});
