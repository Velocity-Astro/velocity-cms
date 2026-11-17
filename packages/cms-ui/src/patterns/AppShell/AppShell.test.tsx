import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { AppShell } from './AppShell.js';

const example = (
  <AppShell
    brand="Lakeshore Realty"
    navLabel="Main"
    skipLabel="Skip to content"
    nav={[
      { id: 'listings', label: 'Listings', href: '/admin/listings', isCurrent: true },
      { id: 'media', label: 'Media', href: '/admin/media' },
    ]}
    footer="Signed in as Dana"
  >
    The screen
  </AppShell>
);

it('draws the screen in the page\'s main area, beside a named navigation', () => {
  render(example);
  expect(screen.getByRole('main').textContent).toBe('The screen');
  const nav = screen.getByRole('navigation', { name: 'Main' });
  expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Listings', 'Media']);
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

it('has no accessibility violations', async () => {
  const { container } = render(example);
  await expectAccessible(container);
});
