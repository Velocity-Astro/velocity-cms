import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { AppShell } from './AppShell.js';

const chosen: string[] = [];
const example = (
  <AppShell
    siteName="Lakeshore Realty"
    siteDetail="Real estate template"
    navLabel="Main"
    menuLabel="Open the menu"
    skipLabel="Skip to content"
    nav={[
      { id: 'top', items: [{ id: 'home', label: 'Home', href: '/admin' }] },
      {
        id: 'content',
        label: 'Content',
        items: [
          { id: 'listings', label: 'Listings', href: '/admin/listings', isCurrent: true },
          { id: 'media', label: 'Media', href: '/admin/media' },
        ],
      },
    ]}
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

it('draws the screen in the page\'s main area, beside a named navigation', () => {
  render(example);
  expect(screen.getByRole('main').textContent).toBe('The screen');
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Home', 'Listings', 'Media']);
  expect(within(nav).getByRole('group', { name: 'Content' })).toBeTruthy();
  expect(screen.getByText('Real estate template')).toBeTruthy();
});

it('marks the current screen for screen readers', () => {
  render(example);
  expect(screen.getByRole('link', { name: 'Listings' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', { name: 'Media' }).hasAttribute('aria-current')).toBe(false);
});

it('offers a way past the navigation as the first thing the keyboard reaches', async () => {
  const user = userEvent.setup();
  render(example);
  await user.tab();
  const skip = screen.getByRole('link', { name: 'Skip to content' });
  expect(document.activeElement).toBe(skip);
  expect(skip.getAttribute('href')).toBe(`#${screen.getByRole('main').id}`);
});

it('moves the keyboard to the main area from the skip link, and leaves the address alone', async () => {
  const user = userEvent.setup();
  render(example);
  const before = window.location.href;
  await user.tab();
  await user.keyboard('{Enter}');
  expect(document.activeElement).toBe(screen.getByRole('main'));
  expect(window.location.href).toBe(before);
});

it('shows who is signed in, with their initials, and opens their menu', async () => {
  const user = userEvent.setup();
  render(example);
  const account = screen.getByRole('button', { name: /^Account/ });
  expect(account.textContent).toBe('AccountDWdana whitfieldOwner');
  await user.click(account);
  await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
  expect(chosen).toEqual(['sign-out']);
});

it('has no accessibility violations', async () => {
  const { container } = render(example);
  await expectAccessible(container);
});
