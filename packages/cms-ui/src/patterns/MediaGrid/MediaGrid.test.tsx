import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { MediaGrid } from './MediaGrid.js';

const items = [
  { id: 'porch', name: 'porch', url: '/media/porch.jpg', note: '1600 × 900' },
  { id: 'kitchen', name: 'kitchen', url: '/media/kitchen.jpg' },
];

it('shows each picture with its name and note', () => {
  render(<MediaGrid label="Photos" items={items} onAction={() => undefined} emptyText="No photos" />);
  const grid = within(screen.getByRole('grid', { name: 'Photos' }));
  expect(grid.getAllByRole('row')).toHaveLength(2);
  expect(grid.getByRole('row', { name: 'porch' }).textContent).toContain('1600 × 900');
});

it('opens a picture on a press, and from the keyboard', async () => {
  const onAction = vi.fn();
  const user = userEvent.setup();
  render(<MediaGrid label="Photos" items={items} onAction={onAction} emptyText="No photos" />);
  await user.click(screen.getByRole('row', { name: 'kitchen' }));
  expect(onAction).toHaveBeenLastCalledWith('kitchen');
  await user.keyboard('{ArrowLeft}{Enter}');
  expect(onAction).toHaveBeenLastCalledWith('porch');
});

it('says so when there are no pictures', () => {
  render(<MediaGrid label="Photos" items={[]} onAction={() => undefined} emptyText="No photos match." />);
  expect(screen.getByText('No photos match.')).toBeTruthy();
});

it('has no accessibility violations', async () => {
  const { container } = render(<MediaGrid label="Photos" items={items} onAction={() => undefined} emptyText="No photos" />);
  await expectAccessible(container);
});
