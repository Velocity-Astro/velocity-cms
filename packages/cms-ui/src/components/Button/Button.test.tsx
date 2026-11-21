import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Plus } from 'lucide-react';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Button } from './Button.js';

it('is a button named by its words, primary and medium by default', () => {
  render(<Button>Publish</Button>);
  const button = screen.getByRole('button', { name: 'Publish' });
  expect(button.getAttribute('type')).toBe('button');
  for (const name of ['bg-primary', 'h-10']) expect(button.className).toContain(name);
});

it('calls onPress for a click, Enter and Space', async () => {
  const onPress = vi.fn();
  const user = userEvent.setup();
  render(<Button onPress={onPress}>Save</Button>);
  await user.click(screen.getByRole('button'));
  await user.keyboard('{Enter}');
  await user.keyboard(' ');
  expect(onPress).toHaveBeenCalledTimes(3);
});

it('does nothing when disabled, and cannot be focused', async () => {
  const onPress = vi.fn();
  const user = userEvent.setup();
  render(
    <Button onPress={onPress} isDisabled>
      Save
    </Button>,
  );
  await user.click(screen.getByRole('button'));
  await user.tab();
  expect(onPress).not.toHaveBeenCalled();
  expect(document.activeElement).not.toBe(screen.getByRole('button'));
});

it('ignores presses while pending but keeps focus', async () => {
  const onPress = vi.fn();
  const user = userEvent.setup();
  render(
    <Button onPress={onPress} isPending>
      Publishing
    </Button>,
  );
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button'));
  await user.keyboard('{Enter}');
  expect(onPress).not.toHaveBeenCalled();
});

it('submits the form it is in', async () => {
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const user = userEvent.setup();
  render(
    <form onSubmit={onSubmit}>
      <Button type="submit">Save</Button>
    </form>,
  );
  await user.click(screen.getByRole('button'));
  expect(onSubmit).toHaveBeenCalledOnce();
});

it('comes in the brand colour for the one step a view leads to', () => {
  render(<Button variant="brand">Publish</Button>);
  expect(screen.getByRole('button', { name: 'Publish' }).getAttribute('class')).toContain('bg-brand-fill');
});

it('hides its icon from screen readers and has no accessibility violations', async () => {
  const { container } = render(
    <Button icon={Plus} variant="secondary" size="sm">
      New listing
    </Button>,
  );
  expect(screen.getByRole('button', { name: 'New listing' }).querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  await expectAccessible(container);
});
