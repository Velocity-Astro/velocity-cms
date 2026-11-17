import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Ellipsis } from 'lucide-react';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { IconButton } from './IconButton.js';

it('is named by its label and hides the icon from screen readers', () => {
  render(<IconButton label="More actions" icon={Ellipsis} />);
  const button = screen.getByRole('button', { name: 'More actions' });
  expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
});

it('shows its label as a tooltip when focused', async () => {
  const user = userEvent.setup();
  render(<IconButton label="More actions" icon={Ellipsis} />);
  await user.tab();
  expect(screen.getByRole('tooltip').textContent).toBe('More actions');
});

it('calls onPress, and not when disabled', async () => {
  const onPress = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(<IconButton label="More actions" icon={Ellipsis} onPress={onPress} />);
  await user.click(screen.getByRole('button'));
  expect(onPress).toHaveBeenCalledOnce();
  rerender(<IconButton label="More actions" icon={Ellipsis} onPress={onPress} isDisabled />);
  await user.click(screen.getByRole('button'));
  expect(onPress).toHaveBeenCalledOnce();
});

it('has no accessibility violations', async () => {
  const { container } = render(<IconButton label="More actions" icon={Ellipsis} />);
  await expectAccessible(container);
});
