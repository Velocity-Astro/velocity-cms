import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Select } from './Select.js';

const options = [
  { id: 'for-sale', label: 'For sale' },
  { id: 'sold', label: 'Sold' },
];

it('shows its label and placeholder, then the chosen option', () => {
  const { rerender } = render(<Select label="Status" options={options} placeholder="Choose a status" />);
  const trigger = screen.getByRole('button', { name: /Status/ });
  expect(trigger.textContent).toContain('Choose a status');
  rerender(<Select label="Status" options={options} value="sold" />);
  expect(trigger.textContent).toContain('Sold');
});

it('opens a list of its options and reports the one chosen by id', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Select label="Status" options={options} onChange={onChange} />);
  await user.click(screen.getByRole('button'));
  const list = screen.getByRole('listbox');
  expect(within(list).getAllByRole('option').map((option) => option.textContent)).toEqual(['For sale', 'Sold']);
  await user.click(within(list).getByRole('option', { name: 'Sold' }));
  expect(onChange).toHaveBeenCalledWith('sold');
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('works with the keyboard alone', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Select label="Status" options={options} onChange={onChange} />);
  await user.tab();
  await user.keyboard('{Enter}');
  await user.keyboard('{ArrowDown}');
  await user.keyboard('{Enter}');
  expect(onChange).toHaveBeenCalledWith('sold');
});

it('shows an error and cannot be opened when disabled', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Select label="Status" options={options} errorMessage="Choose a status." />);
  expect(screen.getByText('Choose a status.')).toBeTruthy();
  rerender(<Select label="Status" options={options} isDisabled />);
  await user.click(screen.getByRole('button'));
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('has no accessibility violations, closed and open', async () => {
  const user = userEvent.setup();
  render(<Select label="Status" options={options} description="Shown as a badge" defaultValue="sold" />);
  await expectAccessible(document.body);
  await user.click(screen.getByRole('button'));
  await expectAccessible(document.body);
});
