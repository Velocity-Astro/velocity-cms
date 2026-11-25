import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { TextField } from '../TextField/index.js';
import { PresenceMark } from './PresenceMark.js';

const example = (label?: string, onEnter?: () => void) => (
  <>
    <PresenceMark label={label} onEnter={onEnter}>
      <TextField label="Title" />
      <TextField label="Subtitle" />
    </PresenceMark>
    <TextField label="Elsewhere" />
  </>
);

it('shows what it holds and nothing else while nobody is there', () => {
  render(example());
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Title' }).closest('[data-taken]')).toBeNull();
});

it('says who is there, in words, and marks what they are at', () => {
  render(example('Ana Ruiz is here'));
  expect(screen.getByRole('status').textContent).toBe('Ana Ruiz is here');
  expect(screen.getByRole('textbox', { name: 'Title' }).closest('[data-taken]')).not.toBeNull();
});

it('says when the person comes inside, once, with a keyboard or a pointer, and not as they move about inside', async () => {
  const user = userEvent.setup();
  const onEnter = vi.fn();
  render(example(undefined, onEnter));
  await user.tab();
  expect(onEnter).toHaveBeenCalledTimes(1);
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Subtitle' }));
  expect(onEnter).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('textbox', { name: 'Elsewhere' }));
  await user.click(screen.getByRole('textbox', { name: 'Title' }));
  expect(onEnter).toHaveBeenCalledTimes(2);
});

it('is accessible', async () => {
  const { container } = render(example('Ana Ruiz is here'));
  await expectAccessible(container);
});
