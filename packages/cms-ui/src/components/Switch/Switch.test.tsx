import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Switch } from './Switch.js';

it('is a switch named by its label', () => {
  render(<Switch label="Show on homepage" />);
  expect((screen.getByRole('switch', { name: 'Show on homepage' }) as HTMLInputElement).checked).toBe(false);
});

it('turns on with a press or Space, and reports the new state', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Switch label="Show on homepage" onChange={onChange} />);
  await user.click(screen.getByText('Show on homepage'));
  expect(onChange).toHaveBeenLastCalledWith(true);
  await user.keyboard(' ');
  expect(onChange).toHaveBeenLastCalledWith(false);
});

it('cannot be changed when disabled', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Switch label="Show on homepage" onChange={onChange} isDisabled />);
  await user.click(screen.getByText('Show on homepage'));
  expect(onChange).not.toHaveBeenCalled();
});

it('has no accessibility violations, off and on', async () => {
  const { container, rerender } = render(<Switch label="Show on homepage" />);
  await expectAccessible(container);
  rerender(<Switch label="Show on homepage" isSelected />);
  await expectAccessible(container);
});
