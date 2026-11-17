import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Checkbox } from './Checkbox.js';

it('is a checkbox named by its label', () => {
  render(<Checkbox label="Featured listing" />);
  expect((screen.getByRole('checkbox', { name: 'Featured listing' }) as HTMLInputElement).checked).toBe(false);
});

it('is ticked by pressing its label or Space, and reports the new state', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Checkbox label="Featured listing" onChange={onChange} />);
  await user.click(screen.getByText('Featured listing'));
  expect(onChange).toHaveBeenLastCalledWith(true);
  await user.keyboard(' ');
  expect(onChange).toHaveBeenLastCalledWith(false);
});

it('reports a mixed state to screen readers', () => {
  render(<Checkbox label="Select all" isIndeterminate />);
  expect((screen.getByRole('checkbox') as HTMLInputElement).indeterminate).toBe(true);
});

it('cannot be changed when disabled', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Checkbox label="Featured listing" onChange={onChange} isDisabled />);
  await user.click(screen.getByText('Featured listing'));
  expect(onChange).not.toHaveBeenCalled();
});

it('has no accessibility violations, off and on', async () => {
  const { container, rerender } = render(<Checkbox label="Featured listing" />);
  await expectAccessible(container);
  rerender(<Checkbox label="Featured listing" isSelected />);
  await expectAccessible(container);
});
