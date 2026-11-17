import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Stat } from './Stat.js';

it('shows the figure in a group named for what it counts', () => {
  render(<Stat label="Drafts" value="3" />);
  expect(within(screen.getByRole('group', { name: 'Drafts' })).getByText('3')).toBeTruthy();
});

it('shows the detail under the figure when there is one', () => {
  render(<Stat label="Drafts" value="3" detail="Not on the site yet" />);
  expect(within(screen.getByRole('group', { name: 'Drafts' })).getByText('Not on the site yet')).toBeTruthy();
});

it('has no accessibility violations', async () => {
  const { container } = render(<Stat label="Drafts" value="3" detail="Not on the site yet" />);
  await expectAccessible(container);
});
