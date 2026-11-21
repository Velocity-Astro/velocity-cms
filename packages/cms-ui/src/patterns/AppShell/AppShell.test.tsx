import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { FileText, House, Image, Layers } from 'lucide-react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { AppShell, type AppShellNavGroup } from './AppShell.js';

const nav = (contentIsCurrent: boolean): AppShellNavGroup[] => [
  { id: 'top', items: [{ id: 'home', label: 'Home', href: '/admin', icon: House, isCurrent: !contentIsCurrent }] },
  {
    id: 'site',
    items: [
      {
        id: 'content',
        label: 'Content',
        href: '/admin/content/listings',
        icon: Layers,
        isCurrent: contentIsCurrent,
        children: [
          {
            id: 'types',
            label: 'Collections',
            items: [
              { id: 'listings', label: 'Listings', href: '/admin/content/listings', icon: FileText, isCurrent: contentIsCurrent, count: '24' },
              { id: 'agents', label: 'Agents', href: '/admin/content/agents', icon: FileText },
            ],
          },
        ],
      },
      { id: 'media', label: 'Media', href: '/admin/media', icon: Image, count: '3' },
    ],
  },
];

const chosen: string[] = [];
const searched: string[] = [];
const example = (contentIsCurrent = true) => (
  <AppShell
    logoLabel="Velocity"
    siteName="Lakeshore Realty"
    siteDetail="lakeshore.example"
    navLabel="Main"
    menuLabel="Open the menu"
    skipLabel="Skip to content"
    nav={nav(contentIsCurrent)}
    search={{ label: 'Search or jump to', shortcut: '⌘K', onPress: () => searched.push('open') }}
    actions={<button type="button">Create</button>}
    account={{
      name: 'dana whitfield',
      detail: 'Owner',
      label: 'Account',
      actions: [{ id: 'sign-out', label: 'Sign out' }],
      onAction: (id) => chosen.push(id),
    }}
  >
    The screen
  </AppShell>
);

it('draws the screen in the page\'s main area, beside a rail of the sections', () => {
  render(example());
  expect(screen.getByRole('main').textContent).toBe('The screen');
  const rail = screen.getByRole('navigation', { name: 'Main' });
  expect(within(rail).getAllByRole('link').map((link) => link.textContent)).toEqual(['Home', 'Content', 'Media3']);
  expect(screen.getByText('Lakeshore Realty')).toBeTruthy();
  expect(screen.getByText('lakeshore.example')).toBeTruthy();
});

it('lists the places of the current section beside the rail, under its name', () => {
  render(example());
  const places = screen.getByRole('navigation', { name: 'Content' });
  expect(within(places).getByRole('group', { name: 'Collections' })).toBeTruthy();
  expect(within(places).getAllByRole('link').map((link) => link.textContent)).toEqual(['Listings24', 'Agents']);
});

it('has no column of places when the current section holds none', () => {
  render(example(false));
  expect(screen.queryByRole('navigation', { name: 'Content' })).toBeNull();
});

it('marks the current section and place for screen readers', () => {
  render(example());
  const rail = screen.getByRole('navigation', { name: 'Main' });
  expect(within(rail).getByRole('link', { name: 'Content' }).getAttribute('aria-current')).toBe('page');
  expect(within(rail).getByRole('link', { name: 'Home' }).hasAttribute('aria-current')).toBe(false);
  const places = screen.getByRole('navigation', { name: 'Content' });
  expect(within(places).getByRole('link', { name: /^Listings/ }).getAttribute('aria-current')).toBe('page');
});

it('names a section of the rail in a tooltip, since the rail shows only its icon', async () => {
  const user = userEvent.setup();
  render(example());
  await user.tab();
  await user.tab();
  expect(document.activeElement).toBe(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Home' }));
  expect((await screen.findByRole('tooltip')).textContent).toBe('Home');
});

it('opens the search from the bar', async () => {
  const user = userEvent.setup();
  render(example());
  await user.click(screen.getByRole('button', { name: 'Search or jump to' }));
  expect(searched).toEqual(['open']);
  expect(screen.getByText('⌘K')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
});

it('offers a way past the navigation as the first thing the keyboard reaches', async () => {
  const user = userEvent.setup();
  render(example());
  await user.tab();
  const skip = screen.getByRole('link', { name: 'Skip to content' });
  expect(document.activeElement).toBe(skip);
  expect(skip.getAttribute('href')).toBe(`#${screen.getByRole('main').id}`);
});

it('moves the keyboard to the main area from the skip link, and leaves the address alone', async () => {
  const user = userEvent.setup();
  render(example());
  const before = window.location.href;
  await user.tab();
  await user.keyboard('{Enter}');
  expect(document.activeElement).toBe(screen.getByRole('main'));
  expect(window.location.href).toBe(before);
});

it('shows who is signed in, with their initials, and opens their menu', async () => {
  const user = userEvent.setup();
  render(example());
  const account = screen.getByRole('button', { name: /^Account/ });
  expect(account.textContent).toBe('AccountDWdana whitfieldOwner');
  await user.click(account);
  await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
  expect(chosen).toEqual(['sign-out']);
});

it('lists every section, with its places under it, in the panel of a narrow window', async () => {
  const user = userEvent.setup();
  render(example());
  await user.click(screen.getByRole('button', { name: 'Open the menu' }));
  const panel = await screen.findByRole('dialog', { name: 'Open the menu' });
  const links = within(within(panel).getByRole('navigation', { name: 'Main' })).getAllByRole('link');
  expect(links.map((link) => link.textContent)).toEqual(['Home', 'Content', 'Listings24', 'Agents', 'Media3']);
  await user.click(within(panel).getByRole('link', { name: 'Agents' }));
  expect(screen.queryByRole('dialog', { name: 'Open the menu' })).toBeNull();
});

it('has no accessibility violations', async () => {
  const { container } = render(example());
  await expectAccessible(container);
});
