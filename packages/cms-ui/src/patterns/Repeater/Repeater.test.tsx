import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Repeater, type RepeaterProps } from './Repeater.js';

const props = (changes: Partial<RepeaterProps> = {}): RepeaterProps => ({
  label: 'Highlights',
  items: ['Porch', 'Studio', 'Lake'].map((text, index) => ({ id: String(index), content: <span>{text}</span> })),
  emptyText: 'No highlights yet',
  addLabel: 'Add highlight',
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onMove: vi.fn(),
  removeLabel: (position) => `Remove highlight ${position}`,
  moveUpLabel: (position) => `Move highlight ${position} up`,
  moveDownLabel: (position) => `Move highlight ${position} down`,
  ...changes,
});

it('shows its items in order inside a group named by its label', () => {
  render(<Repeater {...props()} />);
  const group = within(screen.getByRole('group', { name: 'Highlights' }));
  expect(group.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Porch', 'Studio', 'Lake']);
});

it('adds, removes and moves by pointer and by keyboard', async () => {
  const user = userEvent.setup();
  const all = props();
  render(<Repeater {...all} />);
  await user.click(screen.getByRole('button', { name: 'Add highlight' }));
  expect(all.onAdd).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Remove highlight 2' }));
  expect(all.onRemove).toHaveBeenCalledWith(1);
  await user.click(screen.getByRole('button', { name: 'Move highlight 2 up' }));
  expect(all.onMove).toHaveBeenCalledWith(1, 0);
  screen.getByRole('button', { name: 'Move highlight 2 down' }).focus();
  await user.keyboard('{Enter}');
  expect(all.onMove).toHaveBeenCalledWith(1, 2);
});

it('does not move the first item up or the last item down', () => {
  render(<Repeater {...props()} />);
  expect(screen.getByRole('button', { name: 'Move highlight 1 up' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Move highlight 3 down' })).toHaveProperty('disabled', true);
});

it('says so when it is empty, shows what is wrong, and stops adding when full', () => {
  render(<Repeater {...props({ items: [], errorMessage: 'Add at least one highlight.', isFull: true })} />);
  expect(screen.getByText('No highlights yet')).toBeTruthy();
  expect(screen.getByText('Add at least one highlight.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add highlight' })).toHaveProperty('disabled', true);
});

it('has no accessibility violations', async () => {
  const { container } = render(<Repeater {...props({ description: 'Short chips shown under the price.' })} />);
  await expectAccessible(container);
});
