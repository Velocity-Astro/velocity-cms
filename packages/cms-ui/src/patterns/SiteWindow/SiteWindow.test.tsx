import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { SiteWindow } from './SiteWindow.js';

const example = (onPress: () => void) => (
  <SiteWindow address="lakeshore.example" src="/" title="The home page" label="Edit the home page" meta="Published 3 days ago" onPress={onPress} />
);

it('shows the page as visitors see it, with the site\'s address and when it was published', () => {
  const { container } = render(example(() => undefined));
  const frame = container.querySelector('iframe');
  expect(frame?.getAttribute('src')).toBe('/');
  expect(frame?.getAttribute('title')).toBe('The home page');
  expect(screen.getByText('lakeshore.example')).toBeTruthy();
  expect(screen.getByText('Published 3 days ago')).toBeTruthy();
});

it('keeps the page out of reach: the card\'s one link is what the keyboard finds', async () => {
  const user = userEvent.setup();
  const pressed: string[] = [];
  const { container } = render(example(() => pressed.push('edit')));
  expect(container.querySelector('iframe')?.getAttribute('tabindex')).toBe('-1');
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Edit the home page' }));
  await user.keyboard('{Enter}');
  expect(pressed).toEqual(['edit']);
});

it('leads to an address when it is given one', () => {
  render(<SiteWindow address="lakeshore.example" src="/" title="The home page" label="View the site" href="/" />);
  expect(screen.getByRole('link', { name: 'View the site' }).getAttribute('href')).toBe('/');
});

it('has no accessibility violations', async () => {
  const { container } = render(example(() => undefined));
  await expectAccessible(container);
});
